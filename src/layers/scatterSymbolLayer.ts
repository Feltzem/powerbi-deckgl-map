import {
  Layer,
  color,
  project32,
  picking,
  UNIT,
} from "@deck.gl/core";
import { Geometry, Model } from "@luma.gl/engine";
import type {
  Accessor,
  Color as DeckColor,
  DefaultProps,
  LayerDataSource,
  LayerProps,
  Position,
  Unit,
  UpdateParameters,
} from "@deck.gl/core";
import type { Parameters as LumaParameters } from "@luma.gl/core";
import type { ShaderModule } from "@luma.gl/shadertools";
import {
  defaultScatterSymbolType,
  getScatterSymbolShaderValue,
  ScatterSymbolType,
} from "../scatterSymbols";

const DEFAULT_COLOR: [number, number, number, number] = [0, 0, 0, 255];

type ScatterSymbolUniformProps = {
  radiusScale: number;
  radiusMinPixels: number;
  radiusMaxPixels: number;
  lineWidthScale: number;
  lineWidthMinPixels: number;
  lineWidthMaxPixels: number;
  stroked: boolean;
  filled: boolean;
  antialiasing: boolean;
  billboard: boolean;
  radiusUnits: number;
  lineWidthUnits: number;
};

const scatterSymbolUniformBlock = `\
uniform scatterSymbolUniforms {
  float radiusScale;
  float radiusMinPixels;
  float radiusMaxPixels;
  float lineWidthScale;
  float lineWidthMinPixels;
  float lineWidthMaxPixels;
  float stroked;
  float filled;
  bool antialiasing;
  bool billboard;
  highp int radiusUnits;
  highp int lineWidthUnits;
} scatterSymbol;
`;

const scatterSymbolUniforms = {
  name: "scatterSymbol",
  vs: scatterSymbolUniformBlock,
  fs: scatterSymbolUniformBlock,
  source: "",
  uniformTypes: {
    radiusScale: "f32",
    radiusMinPixels: "f32",
    radiusMaxPixels: "f32",
    lineWidthScale: "f32",
    lineWidthMinPixels: "f32",
    lineWidthMaxPixels: "f32",
    stroked: "f32",
    filled: "f32",
    antialiasing: "f32",
    billboard: "f32",
    radiusUnits: "i32",
    lineWidthUnits: "i32",
  },
} as const satisfies ShaderModule<ScatterSymbolUniformProps>;

const vertexShader = /* glsl */ `\
#version 300 es
#define SHADER_NAME scatter-symbol-layer-vertex-shader

in vec3 positions;

in vec3 instancePositions;
in vec3 instancePositions64Low;
in float instanceRadius;
in float instanceLineWidths;
in vec4 instanceFillColors;
in vec4 instanceLineColors;
in vec3 instancePickingColors;

out vec4 vFillColor;
out vec4 vLineColor;
out vec2 unitPosition;
out float lineWidthPixels;
out float outerRadiusPixels;

void main(void) {
  geometry.worldPosition = instancePositions;

  outerRadiusPixels = clamp(
    project_size_to_pixel(scatterSymbol.radiusScale * instanceRadius, scatterSymbol.radiusUnits),
    scatterSymbol.radiusMinPixels, scatterSymbol.radiusMaxPixels
  );

  lineWidthPixels = clamp(
    project_size_to_pixel(scatterSymbol.lineWidthScale * instanceLineWidths, scatterSymbol.lineWidthUnits),
    scatterSymbol.lineWidthMinPixels, scatterSymbol.lineWidthMaxPixels
  );

  outerRadiusPixels += scatterSymbol.stroked * lineWidthPixels / 2.0;

  float edgePadding = scatterSymbol.antialiasing ?
    (outerRadiusPixels + SMOOTH_EDGE_RADIUS) / outerRadiusPixels :
    1.0;

  unitPosition = edgePadding * positions.xy;
  geometry.uv = unitPosition;
  geometry.pickingColor = instancePickingColors;

  if (scatterSymbol.billboard) {
    gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, vec3(0.0), geometry.position);
    DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
    vec3 offset = edgePadding * positions * outerRadiusPixels;
    DECKGL_FILTER_SIZE(offset, geometry);
    gl_Position.xy += project_pixel_size_to_clipspace(offset.xy);
  } else {
    vec3 offset = edgePadding * positions * project_pixel_size(outerRadiusPixels);
    DECKGL_FILTER_SIZE(offset, geometry);
    gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, offset, geometry.position);
    DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
  }

  vFillColor = vec4(instanceFillColors.rgb, instanceFillColors.a * layer.opacity);
  DECKGL_FILTER_COLOR(vFillColor, geometry);
  vLineColor = vec4(instanceLineColors.rgb, instanceLineColors.a * layer.opacity);
  DECKGL_FILTER_COLOR(vLineColor, geometry);
}
`;

const fragmentShader = /* glsl */ `\
#version 300 es
#define SHADER_NAME scatter-symbol-layer-fragment-shader

precision highp float;

in vec4 vFillColor;
in vec4 vLineColor;
in vec2 unitPosition;
in float lineWidthPixels;
in float outerRadiusPixels;

out vec4 fragColor;

const float PI = 3.141592653589793;
const float TWO_PI = 6.283185307179586;
const float SCATTER_SYMBOL_TYPE = __SCATTER_SYMBOL_TYPE__;

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

vec2 regularPolygonPoint(int index, int pointCount, float rotation) {
  float angle = rotation + TWO_PI * float(index) / float(pointCount);
  return vec2(cos(angle), sin(angle));
}

float sdRegularPolygon(vec2 p, int pointCount, float rotation) {
  float minDistance = 1000.0;
  bool inside = false;

  for (int index = 0; index < 6; index++) {
    if (index < pointCount) {
      vec2 a = regularPolygonPoint(index, pointCount, rotation);
      vec2 b = regularPolygonPoint((index + 1) % pointCount, pointCount, rotation);
      minDistance = min(minDistance, sdSegment(p, a, b));

      if ((a.y > p.y) != (b.y > p.y)) {
        float intersectionX = (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x;
        if (p.x < intersectionX) {
          inside = !inside;
        }
      }
    }
  }

  return inside ? -minDistance : minDistance;
}

vec2 starPoint(int index) {
  float radius = mod(float(index), 2.0) == 0.0 ? 1.0 : 0.43;
  float angle = PI / 2.0 + PI * float(index) / 5.0;
  return radius * vec2(cos(angle), sin(angle));
}

float sdStar(vec2 p) {
  float minDistance = 1000.0;
  bool inside = false;

  for (int index = 0; index < 10; index++) {
    vec2 a = starPoint(index);
    vec2 b = starPoint((index + 1) % 10);
    minDistance = min(minDistance, sdSegment(p, a, b));

    if ((a.y > p.y) != (b.y > p.y)) {
      float intersectionX = (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x;
      if (p.x < intersectionX) {
        inside = !inside;
      }
    }
  }

  return inside ? -minDistance : minDistance;
}

vec2 rotate2d(vec2 p, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float sdCross(vec2 p) {
  float vertical = sdBox(p, vec2(0.28, 1.0));
  float horizontal = sdBox(p, vec2(1.0, 0.28));
  return min(vertical, horizontal);
}

float sdSymbol(vec2 p) {
  if (SCATTER_SYMBOL_TYPE == 1.0) {
    return sdBox(p, vec2(1.0));
  }
  if (SCATTER_SYMBOL_TYPE == 2.0) {
    return sdRegularPolygon(p, 4, PI / 2.0);
  }
  if (SCATTER_SYMBOL_TYPE == 3.0) {
    return sdRegularPolygon(p, 3, PI / 2.0);
  }
  if (SCATTER_SYMBOL_TYPE == 4.0) {
    return sdRegularPolygon(p, 3, -PI / 2.0);
  }
  if (SCATTER_SYMBOL_TYPE == 5.0) {
    return sdRegularPolygon(p, 6, PI / 2.0);
  }
  if (SCATTER_SYMBOL_TYPE == 6.0) {
    return sdRegularPolygon(p, 5, PI / 2.0);
  }
  if (SCATTER_SYMBOL_TYPE == 7.0) {
    return sdStar(p);
  }
  if (SCATTER_SYMBOL_TYPE == 8.0) {
    return sdCross(p);
  }
  if (SCATTER_SYMBOL_TYPE == 9.0) {
    return sdCross(rotate2d(p, PI / 4.0));
  }

  return length(p) - 1.0;
}

void main(void) {
  geometry.uv = unitPosition;

  float signedDistancePixels = sdSymbol(unitPosition) * outerRadiusPixels;
  float inSymbol = scatterSymbol.antialiasing ?
    smoothedge(signedDistancePixels, 0.0) :
    step(signedDistancePixels, 0.0);

  if (inSymbol == 0.0) {
    discard;
  }

  if (scatterSymbol.stroked > 0.5) {
    float isLine = scatterSymbol.antialiasing ?
      smoothedge(-lineWidthPixels, signedDistancePixels) :
      step(-lineWidthPixels, signedDistancePixels);

    if (scatterSymbol.filled > 0.5) {
      fragColor = mix(vFillColor, vLineColor, isLine);
    } else {
      if (isLine == 0.0) {
        discard;
      }
      fragColor = vec4(vLineColor.rgb, vLineColor.a * isLine);
    }
  } else if (scatterSymbol.filled < 0.5) {
    discard;
  } else {
    fragColor = vFillColor;
  }

  fragColor.a *= inSymbol;
  DECKGL_FILTER_COLOR(fragColor, geometry);
}
`;

const getFragmentShader = (symbolType: ScatterSymbolType): string => {
  const shaderValue = getScatterSymbolShaderValue(symbolType);
  return fragmentShader.replace(
    "__SCATTER_SYMBOL_TYPE__",
    `${shaderValue}.0`,
  );
};

type ScatterSymbolLayerSpecificProps<DataT> = {
  data: LayerDataSource<DataT>;
  symbolType?: ScatterSymbolType;
  radiusUnits?: Unit;
  radiusScale?: number;
  radiusMinPixels?: number;
  radiusMaxPixels?: number;
  lineWidthUnits?: Unit;
  lineWidthScale?: number;
  lineWidthMinPixels?: number;
  lineWidthMaxPixels?: number;
  stroked?: boolean;
  filled?: boolean;
  billboard?: boolean;
  antialiasing?: boolean;
  getPosition?: Accessor<DataT, Position>;
  getRadius?: Accessor<DataT, number>;
  getFillColor?: Accessor<DataT, DeckColor>;
  getLineColor?: Accessor<DataT, DeckColor>;
  getLineWidth?: Accessor<DataT, number>;
};

export type ScatterSymbolLayerProps<DataT = unknown> =
  ScatterSymbolLayerSpecificProps<DataT> & LayerProps;

const defaultProps: DefaultProps<ScatterSymbolLayerProps> = {
  symbolType: defaultScatterSymbolType,
  radiusUnits: "meters",
  radiusScale: { type: "number", min: 0, value: 1 },
  radiusMinPixels: { type: "number", min: 0, value: 0 },
  radiusMaxPixels: { type: "number", min: 0, value: Number.MAX_SAFE_INTEGER },
  lineWidthUnits: "meters",
  lineWidthScale: { type: "number", min: 0, value: 1 },
  lineWidthMinPixels: { type: "number", min: 0, value: 0 },
  lineWidthMaxPixels: { type: "number", min: 0, value: Number.MAX_SAFE_INTEGER },
  stroked: false,
  filled: true,
  billboard: false,
  antialiasing: true,
  getPosition: { type: "accessor", value: (x: any) => x.position },
  getRadius: { type: "accessor", value: 1 },
  getFillColor: { type: "accessor", value: DEFAULT_COLOR },
  getLineColor: { type: "accessor", value: DEFAULT_COLOR },
  getLineWidth: { type: "accessor", value: 1 },
};

export default class ScatterSymbolLayer<
  DataT = any,
  ExtraPropsT extends {} = {},
> extends Layer<ExtraPropsT & Required<ScatterSymbolLayerSpecificProps<DataT>>> {
  static defaultProps = defaultProps;
  static layerName = "ScatterSymbolLayer";

  declare state: {
    model?: Model;
  };

  getShaders() {
    const symbolType = this.props.symbolType ?? defaultScatterSymbolType;

    return super.getShaders({
      vs: vertexShader,
      fs: getFragmentShader(symbolType),
      modules: [project32, color, picking, scatterSymbolUniforms],
    });
  }

  initializeState() {
    this.getAttributeManager()!.addInstanced({
      instancePositions: {
        size: 3,
        type: "float64",
        fp64: this.use64bitPositions(),
        transition: true,
        accessor: "getPosition",
      },
      instanceRadius: {
        size: 1,
        transition: true,
        accessor: "getRadius",
        defaultValue: 1,
      },
      instanceFillColors: {
        size: this.props.colorFormat.length,
        transition: true,
        type: "unorm8",
        accessor: "getFillColor",
        defaultValue: DEFAULT_COLOR,
      },
      instanceLineColors: {
        size: this.props.colorFormat.length,
        transition: true,
        type: "unorm8",
        accessor: "getLineColor",
        defaultValue: DEFAULT_COLOR,
      },
      instanceLineWidths: {
        size: 1,
        transition: true,
        accessor: "getLineWidth",
        defaultValue: 1,
      },
    });
    this.state.model = this._getModel();
  }

  updateState(params: UpdateParameters<this>) {
    super.updateState(params);

    const symbolChanged =
      params.oldProps.symbolType !== params.props.symbolType;

    if (params.changeFlags.extensionsChanged || symbolChanged) {
      this.state.model?.destroy();
      this.state.model = this._getModel();
      this.getAttributeManager()!.invalidateAll();
    }
  }

  draw({ uniforms }: { uniforms: unknown }) {
    void uniforms;

    const {
      radiusUnits,
      radiusScale,
      radiusMinPixels,
      radiusMaxPixels,
      stroked,
      filled,
      billboard,
      antialiasing,
      lineWidthUnits,
      lineWidthScale,
      lineWidthMinPixels,
      lineWidthMaxPixels,
    } = this.props;
    const scatterSymbolProps: ScatterSymbolUniformProps = {
      stroked,
      filled,
      billboard,
      antialiasing,
      radiusUnits: UNIT[radiusUnits],
      radiusScale,
      radiusMinPixels,
      radiusMaxPixels,
      lineWidthUnits: UNIT[lineWidthUnits],
      lineWidthScale,
      lineWidthMinPixels,
      lineWidthMaxPixels,
    };
    const model = this.state.model!;
    model.shaderInputs.setProps({ scatterSymbol: scatterSymbolProps });
    if (this.context.device.type === "webgpu") {
      model.instanceCount =
        (this.props.data as { length?: number }).length ?? 0;
    }
    model.draw(this.context.renderPass);
  }

  protected _getModel() {
    const parameters =
      this.context.device.type === "webgpu"
        ? ({
            depthWriteEnabled: true,
            depthCompare: "less-equal",
          } satisfies LumaParameters)
        : undefined;
    const positions = [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0];

    return new Model(this.context.device, {
      ...this.getShaders(),
      id: this.props.id,
      bufferLayout: this.getAttributeManager()!.getBufferLayouts(),
      geometry: new Geometry({
        topology: "triangle-strip",
        attributes: {
          positions: { size: 3, value: new Float32Array(positions) },
        },
      }),
      isInstanced: true,
      parameters,
    });
  }
}
