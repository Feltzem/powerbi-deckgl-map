import { PathLayer, PathLayerProps } from "@deck.gl/layers";
import type { Accessor, DefaultProps } from "@deck.gl/core";
import type { ShaderModule } from "@luma.gl/shadertools";

/**
 * A PathLayer that discards path segments whose [sourceTimestamp,
 * targetTimestamp] interval falls entirely outside a trailing time window.
 *
 * The window is pushed once per frame as the `timeRange` uniform, so the
 * animation advances by updating a uniform rather than rebuilding layer data.
 * Ported from app/src/layers/temporallyAppearingPathLayer.js and adapted to the
 * deck.gl 9 uniform-block module API (the old params.uniforms path is gone).
 */

type TimeRange = [number, number];

interface TemporalPathUniformProps {
  timeRange: TimeRange;
}

const timeRangeUniformBlock = `\
uniform temporalPathUniforms {
  vec2 timeRange;
} temporalPath;
`;

const temporalPathUniforms = {
  name: "temporalPath",
  vs: timeRangeUniformBlock,
  fs: timeRangeUniformBlock,
  source: "",
  uniformTypes: {
    timeRange: "vec2<f32>",
  },
} as const satisfies ShaderModule<TemporalPathUniformProps>;

export interface TemporallyAppearingPathLayerProps<DataT = unknown>
  extends PathLayerProps<DataT> {
  /** Per-path source vertex timestamp (Unix seconds). */
  getSourceTimestamp?: Accessor<DataT, number>;
  /** Per-path target vertex timestamp (Unix seconds). */
  getTargetTimestamp?: Accessor<DataT, number>;
  /** Per-path flag: 1 when the path has a usable timestamp, else 0. */
  getHasTimestamp?: Accessor<DataT, number>;
  /** Visible window [start, end] in Unix seconds; segments outside discard. */
  timeRange?: TimeRange;
}

const defaultProps: DefaultProps<TemporallyAppearingPathLayerProps> = {
  getSourceTimestamp: { type: "accessor", value: 0 },
  getTargetTimestamp: { type: "accessor", value: 0 },
  getHasTimestamp: { type: "accessor", value: 1 },
  timeRange: { type: "array", compare: true, value: [0, 0] },
};

export default class TemporallyAppearingPathLayer<
  DataT = unknown,
  ExtraPropsT extends {} = {},
> extends PathLayer<DataT, ExtraPropsT & TemporallyAppearingPathLayerProps<DataT>> {
  static layerName = "TemporallyAppearingPathLayer";
  static defaultProps = defaultProps as DefaultProps<PathLayerProps>;

  getShaders() {
    const shaders = super.getShaders();
    shaders.modules = [...shaders.modules, temporalPathUniforms];
    shaders.inject = {
      ...(shaders.inject ?? {}),
      "vs:#decl": `\
${shaders.inject?.["vs:#decl"] ?? ""}
in float instanceSourceTimestamp;
in float instanceTargetTimestamp;
in float instanceHasTimestamp;
out float vSourceTimestamp;
out float vTargetTimestamp;
out float vHasTimestamp;
`,
      "vs:#main-end": `\
${shaders.inject?.["vs:#main-end"] ?? ""}
vSourceTimestamp = instanceSourceTimestamp;
vTargetTimestamp = instanceTargetTimestamp;
vHasTimestamp = instanceHasTimestamp;
`,
      "fs:#decl": `\
${shaders.inject?.["fs:#decl"] ?? ""}
in float vSourceTimestamp;
in float vTargetTimestamp;
in float vHasTimestamp;
`,
      // Untimed paths (vHasTimestamp < 0.5) always render; timed paths discard
      // when their interval is entirely outside the window.
      "fs:#main-start": `\
${shaders.inject?.["fs:#main-start"] ?? ""}
if (vHasTimestamp > 0.5 &&
    (vSourceTimestamp > temporalPath.timeRange.y ||
     vTargetTimestamp < temporalPath.timeRange.x)) {
  discard;
}
`,
    };
    return shaders;
  }

  initializeState() {
    super.initializeState();
    const attributeManager = this.getAttributeManager();
    attributeManager?.addInstanced({
      instanceSourceTimestamp: {
        size: 1,
        accessor: "getSourceTimestamp",
        defaultValue: 0,
      },
      instanceTargetTimestamp: {
        size: 1,
        accessor: "getTargetTimestamp",
        defaultValue: 0,
      },
      instanceHasTimestamp: {
        size: 1,
        accessor: "getHasTimestamp",
        defaultValue: 1,
      },
    });
  }

  draw(opts: Parameters<PathLayer<DataT>["draw"]>[0]) {
    const timeRange = (this.props.timeRange ?? [0, 0]) as TimeRange;
    const model = this.state.model;
    model?.shaderInputs.setProps({
      temporalPath: { timeRange },
    });
    super.draw(opts);
  }
}
