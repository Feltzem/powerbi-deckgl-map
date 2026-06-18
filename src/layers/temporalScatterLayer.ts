import type { Accessor, DefaultProps } from "@deck.gl/core";
import type { ShaderModule } from "@luma.gl/shadertools";
import ScatterSymbolLayer, {
  ScatterSymbolLayerProps,
} from "./scatterSymbolLayer";

/**
 * ScatterSymbolLayer that, when animation is active, derives each point's Z
 * from its timestamp (z = clamp((t - t0)/dt, 0, 1) * maxHeight) and discards
 * points outside the trailing window [time - trailLength, time]. Both run in
 * the shader from a uniform block, so a frame advances by pushing the `time`
 * uniform rather than rebuilding layer data. Rows with explicit scatter
 * elevation preserve that bound Z; timestamp then only controls visibility.
 *
 * ScatterSymbolLayer already owns a full vertex shader (and supports the
 * `circle` symbol), so this subclass transforms that shader to use an animated
 * position in the projection calls instead of duplicating the whole program.
 */

/**
 * Apply a shader-source substitution and throw if it matched nothing, so a
 * future deck.gl/ScatterSymbolLayer shader change that breaks an anchor fails
 * loudly at layer construction rather than silently dropping the animation.
 */
const replaceOrThrow = (
  source: string,
  pattern: string | RegExp,
  replacement: string,
  label: string,
): string => {
  const next = source.replace(pattern, replacement);
  if (next === source) {
    throw new Error(
      `TemporalScatterLayer: shader anchor not found for ${label}; the base ScatterSymbolLayer shader may have changed.`,
    );
  }
  return next;
};

interface TemporalScatterUniformProps {
  /** Current playhead, in seconds relative to the domain start (t0). */
  time: number;
  /** Domain span (t1 - t0), seconds. */
  dt: number;
  maxHeight: number;
  trailLength: number;
  /** 1 = derive Z from timestamp; 0 = leave the bound position Z untouched. */
  deriveHeight: number;
  /** 1 = window discard active; 0 = always show. */
  windowActive: number;
}

const temporalScatterUniformBlock = `\
uniform temporalScatterUniforms {
  float time;
  float dt;
  float maxHeight;
  float trailLength;
  float deriveHeight;
  float windowActive;
} temporalScatter;
`;

const temporalScatterUniforms = {
  name: "temporalScatter",
  vs: temporalScatterUniformBlock,
  fs: temporalScatterUniformBlock,
  source: "",
  uniformTypes: {
    time: "f32",
    dt: "f32",
    maxHeight: "f32",
    trailLength: "f32",
    deriveHeight: "f32",
    windowActive: "f32",
  },
} as const satisfies ShaderModule<TemporalScatterUniformProps>;

export interface TemporalScatterLayerProps<DataT = unknown>
  extends ScatterSymbolLayerProps<DataT> {
  /** Per-point timestamp in seconds relative to the domain start (t0). */
  getTimestamp?: Accessor<DataT, number>;
  /** Per-point flag: 1 when the row has a usable timestamp, else 0. */
  getHasTimestamp?: Accessor<DataT, number>;
  /** Per-point flag: 1 when the row has a bound scatter elevation, else 0. */
  getHasElevation?: Accessor<DataT, number>;
  /** Current playhead, in seconds relative to t0. */
  time?: number;
  dt?: number;
  maxHeight?: number;
  trailLength?: number;
  deriveHeight?: boolean;
  windowActive?: boolean;
}

const defaultProps: DefaultProps<TemporalScatterLayerProps> = {
  getTimestamp: { type: "accessor", value: 0 },
  getHasTimestamp: { type: "accessor", value: 1 },
  getHasElevation: { type: "accessor", value: 0 },
  time: { type: "number", value: 0 },
  dt: { type: "number", value: 1 },
  maxHeight: { type: "number", value: 0 },
  trailLength: { type: "number", value: 0 },
  deriveHeight: { type: "boolean", value: false },
  windowActive: { type: "boolean", value: false },
};

export default class TemporalScatterLayer<
  DataT = unknown,
  ExtraPropsT extends {} = {},
> extends ScatterSymbolLayer<DataT, ExtraPropsT & TemporalScatterLayerProps<DataT>> {
  static layerName = "TemporalScatterLayer";
  static defaultProps = defaultProps;

  getShaders() {
    const shaders = super.getShaders();
    shaders.modules = [...shaders.modules, temporalScatterUniforms];

    // Compute the animated world position once, then route the projection
    // calls through it instead of the raw instancePositions attribute. Rows
    // with explicit scatter elevation keep their bound Z; rows without a bound
    // timestamp carry instanceHasTimestamp = 0, keep their ground Z, and are
    // exempt from the window discard so static points stay visible. We use
    // explicit 0/1 flags rather than isnan(), which several GPU drivers fold to
    // a constant under fast-math.
    // The derived Z is a fresh single-precision value, so its fp64 "low" part
    // is 0; copy the original 64-low for x/y and zero z to keep the high/low
    // pair consistent for project_position_to_clipspace.
    const animatedPositionSetup = `
  bool hasTimestamp = instanceHasTimestamp > 0.5;
  bool hasElevation = instanceHasElevation > 0.5;
  vec3 animatedInstancePositions = instancePositions;
  vec3 animatedInstancePositions64Low = instancePositions64Low;
  if (hasTimestamp && !hasElevation && temporalScatter.deriveHeight > 0.5 && temporalScatter.dt > 0.0) {
    float frac = clamp(
      instanceTimestamp / temporalScatter.dt, 0.0, 1.0
    );
    animatedInstancePositions.z = frac * temporalScatter.maxHeight;
    animatedInstancePositions64Low.z = 0.0;
  }
`;

    let vs = shaders.vs as string;
    vs = replaceOrThrow(
      vs,
      "void main(void) {",
      `in float instanceTimestamp;\nin float instanceHasTimestamp;\nin float instanceHasElevation;\nout float vTimestamp;\nout float vHasTimestamp;\nvoid main(void) {${animatedPositionSetup}  vTimestamp = instanceTimestamp;\n  vHasTimestamp = instanceHasTimestamp;\n`,
      "vs main entry",
    );
    // Project from the animated position (with its matching 64-low) so the Z
    // lifts the point without breaking double-precision projection.
    vs = replaceOrThrow(
      vs,
      /project_position_to_clipspace\(\s*instancePositions,\s*instancePositions64Low,/g,
      "project_position_to_clipspace(animatedInstancePositions, animatedInstancePositions64Low,",
      "vs projection call",
    );
    vs = replaceOrThrow(
      vs,
      "geometry.worldPosition = instancePositions;",
      "geometry.worldPosition = animatedInstancePositions;",
      "vs worldPosition",
    );
    shaders.vs = vs;

    // Discard points outside the trailing window in the fragment shader. A
    // vHasTimestamp >= 0.5 guard keeps untimed points visible without relying
    // on isnan().
    shaders.fs = replaceOrThrow(
      shaders.fs as string,
      "void main(void) {",
      "in float vTimestamp;\nin float vHasTimestamp;\nvoid main(void) {\n  if (temporalScatter.windowActive > 0.5 && vHasTimestamp > 0.5 && (vTimestamp > temporalScatter.time || vTimestamp < temporalScatter.time - temporalScatter.trailLength)) {\n    discard;\n  }\n",
      "fs main entry",
    );

    return shaders;
  }

  initializeState() {
    super.initializeState();
    this.getAttributeManager()?.addInstanced({
      instanceTimestamp: {
        size: 1,
        accessor: "getTimestamp",
        defaultValue: 0,
      },
      instanceHasTimestamp: {
        size: 1,
        accessor: "getHasTimestamp",
        defaultValue: 1,
      },
      instanceHasElevation: {
        size: 1,
        accessor: "getHasElevation",
        defaultValue: 0,
      },
    });
  }

  draw(opts: Parameters<ScatterSymbolLayer<DataT>["draw"]>[0]) {
    const model = this.state.model;
    model?.shaderInputs.setProps({
      temporalScatter: {
        time: this.props.time ?? 0,
        dt: this.props.dt ?? 1,
        maxHeight: this.props.maxHeight ?? 0,
        trailLength: this.props.trailLength ?? 0,
        deriveHeight: this.props.deriveHeight ? 1 : 0,
        windowActive: this.props.windowActive ? 1 : 0,
      },
    });
    super.draw(opts);
  }
}
