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
 * uniform rather than rebuilding layer data.
 *
 * ScatterSymbolLayer already owns a full vertex shader (and supports the
 * `circle` symbol), so this subclass transforms that shader to use an animated
 * position in the projection calls instead of duplicating the whole program.
 */

interface TemporalScatterUniformProps {
  time: number;
  t0: number;
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
  float t0;
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
    t0: "f32",
    dt: "f32",
    maxHeight: "f32",
    trailLength: "f32",
    deriveHeight: "f32",
    windowActive: "f32",
  },
} as const satisfies ShaderModule<TemporalScatterUniformProps>;

export interface TemporalScatterLayerProps<DataT = unknown>
  extends ScatterSymbolLayerProps<DataT> {
  getTimestamp?: Accessor<DataT, number>;
  time?: number;
  t0?: number;
  dt?: number;
  maxHeight?: number;
  trailLength?: number;
  deriveHeight?: boolean;
  windowActive?: boolean;
}

const defaultProps: DefaultProps<TemporalScatterLayerProps> = {
  getTimestamp: { type: "accessor", value: 0 },
  time: { type: "number", value: 0 },
  t0: { type: "number", value: 0 },
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
  static defaultProps = defaultProps as DefaultProps<ScatterSymbolLayerProps>;

  getShaders() {
    const shaders = super.getShaders();
    shaders.modules = [...shaders.modules, temporalScatterUniforms];

    // Compute the animated world position once, then route the projection
    // calls through it instead of the raw instancePositions attribute.
    // Rows without a bound timestamp arrive as NaN; they keep their ground Z
    // and are exempt from the window discard so static points stay visible.
    const animatedPositionSetup = `
  bool hasTimestamp = !isnan(instanceTimestamp);
  vec3 animatedInstancePositions = instancePositions;
  if (hasTimestamp && temporalScatter.deriveHeight > 0.5 && temporalScatter.dt > 0.0) {
    float frac = clamp(
      (instanceTimestamp - temporalScatter.t0) / temporalScatter.dt, 0.0, 1.0
    );
    animatedInstancePositions.z = frac * temporalScatter.maxHeight;
  }
`;

    let vs = shaders.vs as string;
    vs = vs.replace(
      "void main(void) {",
      `in float instanceTimestamp;\nout float vTimestamp;\nvoid main(void) {${animatedPositionSetup}  vTimestamp = instanceTimestamp;\n`,
    );
    // Project from the animated position so the Z lifts the point.
    vs = vs.replace(
      /project_position_to_clipspace\(\s*instancePositions,/g,
      "project_position_to_clipspace(animatedInstancePositions,",
    );
    vs = vs.replace(
      "geometry.worldPosition = instancePositions;",
      "geometry.worldPosition = animatedInstancePositions;",
    );
    shaders.vs = vs;

    // Discard points outside the trailing window in the fragment shader.
    let fs = shaders.fs as string;
    fs = fs.replace(
      "void main(void) {",
      "in float vTimestamp;\nvoid main(void) {\n  if (temporalScatter.windowActive > 0.5 && !isnan(vTimestamp) && (vTimestamp > temporalScatter.time || vTimestamp < temporalScatter.time - temporalScatter.trailLength)) {\n    discard;\n  }\n",
    );
    shaders.fs = fs;

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
    });
  }

  draw(opts: Parameters<ScatterSymbolLayer<DataT>["draw"]>[0]) {
    const model = this.state.model;
    model?.shaderInputs.setProps({
      temporalScatter: {
        time: this.props.time ?? 0,
        t0: this.props.t0 ?? 0,
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
