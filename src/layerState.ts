export const DEFAULT_LAYER_DRAW_ORDER = [
  "scatter",
  "line",
  "arc",
  "path",
  "polygon",
] as const;

export type RenderableGeometryType = (typeof DEFAULT_LAYER_DRAW_ORDER)[number];

export const GEOMETRY_TYPE_LABELS: Record<RenderableGeometryType, string> = {
  scatter: "Scatter",
  line: "Line",
  arc: "Arc",
  path: "Path",
  polygon: "Polygon",
};

export const LAYER_IDS: Record<RenderableGeometryType, string> = {
  scatter: "scatterplot-layer-base",
  line: "line-layer-base",
  arc: "arc-layer-base",
  path: "path-layer-base",
  polygon: "polygon-layer-base",
};

export const LABEL_LAYER_ID = "feature-label-layer-base";
export const TEMPORAL_LABEL_LAYER_ID = `${LABEL_LAYER_ID}-temporal`;

export const getTemporalLayerId = (
  geometryType: RenderableGeometryType,
): string => `${LAYER_IDS[geometryType]}-temporal`;

const renderableGeometryTypes = new Set<string>(DEFAULT_LAYER_DRAW_ORDER);
const layerIdToGeometryType = new Map<string, RenderableGeometryType>(
  DEFAULT_LAYER_DRAW_ORDER.map((type): [string, RenderableGeometryType] => [
    LAYER_IDS[type],
    type,
  ]),
);

export const isRenderableGeometryType = (
  value: unknown,
): value is RenderableGeometryType =>
  typeof value === "string" && renderableGeometryTypes.has(value);

export const getGeometryTypeForLayerId = (
  layerId: string | null | undefined,
): RenderableGeometryType | null => {
  if (!layerId) {
    return null;
  }

  const exactMatch = layerIdToGeometryType.get(layerId);
  if (exactMatch) {
    return exactMatch;
  }

  for (const type of DEFAULT_LAYER_DRAW_ORDER) {
    if (layerId.startsWith(`${LAYER_IDS[type]}-`)) {
      return type;
    }
  }

  return null;
};

export const parseLayerDrawOrder = (
  value: unknown,
): RenderableGeometryType[] => {
  const seen = new Set<RenderableGeometryType>();
  const parsedOrder: RenderableGeometryType[] = [];
  const tokens =
    typeof value === "string"
      ? value
          .split(/[,\s]+/)
          .map((token) => token.trim().toLowerCase())
          .filter((token) => token.length > 0)
      : [];

  for (const token of tokens) {
    if (!isRenderableGeometryType(token) || seen.has(token)) {
      continue;
    }

    seen.add(token);
    parsedOrder.push(token);
  }

  for (const type of DEFAULT_LAYER_DRAW_ORDER) {
    if (!seen.has(type)) {
      parsedOrder.push(type);
    }
  }

  return parsedOrder;
};
