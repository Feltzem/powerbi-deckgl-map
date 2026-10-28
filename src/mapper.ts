import powerbi from "powerbi-visuals-api";
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import ISelectionId = powerbi.visuals.ISelectionId;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import { decodeAsGeometry } from "./encoding";
import { PackedGeometryBatch, unpackGeometry } from "./geometryPacking";
import { geometryHasZ } from "./geometryZ";
import { computeTimeDomain, TimeDomain, toUnixSeconds } from "./time";
import {
  BoundingBox,
  DatasetSnapshot,
  ColorRoleStatsStore,
  GeometryCache,
  InputLayerType,
  LayerDataStore,
  OurData,
  RowValueArrays,
  RowValueAvailability,
  RowValues,
  createEmptyLayerDataStore,
} from "./dataTypes";
import {
  createEmptyColorRoleStatsStore,
  updateColorRoleStats,
} from "./colorRoles";
import { VisualFormattingSettingsModel } from "./settings";
import { WKTLoader } from "@loaders.gl/wkt";
import { parseSync } from "@loaders.gl/core";
import { Geometry } from "geojson";
import { parsePath } from "./parsers/path";
import { parsePolygon } from "./parsers/polygon";
import { parseScatter } from "./parsers/scatter";
import { parseLine, parseArc } from "./parsers/lineArc";
import { getDataBoundingBox, validateData } from "./geom";
import { getStrictNumberFromValue, parseColorInput } from "./powerbiUtils";
import {
  getGroupedRoleColumns,
  getRoleRowCount,
  isMeaningfulPrimitiveValue,
  RoleColumn,
} from "./roleColumnUtils";

const roleMappings: Array<[keyof RowValues, string]> = [
  ["layerType", "layerType"],
  ["featureLabel", "featureLabel"],
  ["labelPriority", "labelPriority"],
  ["wkp", "wkp"],
  ["wkt", "wkt"],
  ["point1Latitude", "point1Latitude"],
  ["point1Longitude", "point1Longitude"],
  ["point2Latitude", "point2Latitude"],
  ["point2Longitude", "point2Longitude"],
  ["scatterRadius", "scatterRadius"],
  ["scatterElevation", "scatterElevation"],
  ["heatmapWeight", "heatmapWeight"],
  ["scatterLineColor", "scatterLineColor"],
  ["scatterLineWidth", "scatterLineWidth"],
  ["scatterFillColor", "scatterFillColor"],
  ["lineLineWidth", "lineLineWidth"],
  ["lineLineColor", "lineLineColor"],
  ["pathWidth", "pathWidth"],
  ["pathColor", "pathColor"],
  ["polygonLineColor", "polygonLineColor"],
  ["polygonLineWidth", "polygonLineWidth"],
  ["polygonFillColor", "polygonFillColor"],
  ["polygonExtrudeElevation", "polygonExtrudeElevation"],
  ["arcLineWidth", "arcLineWidth"],
  ["arcSourceColor", "arcSourceColor"],
  ["arcTargetColor", "arcTargetColor"],
  ["tooltip", "tooltipHtml"],
  ["timestamp", "timestamp"],
];

type RoleColumnCandidate = RoleColumn;

const colorRoleFields = new Set<keyof RowValues>([
  "scatterLineColor",
  "scatterFillColor",
  "lineLineColor",
  "pathColor",
  "polygonLineColor",
  "polygonFillColor",
  "arcSourceColor",
  "arcTargetColor",
]);

const numericRoleFields = new Set<keyof RowValues>([
  "labelPriority",
  "scatterElevation",
  "heatmapWeight",
  "polygonExtrudeElevation",
]);

const tooltipHtmlMaxLength = 4000;
const groupedNumericTolerance = 1e-12;

const normalizeSourceName = (
  value: string | null | undefined,
): string | null => {
  const normalized = value?.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return normalized ? normalized : null;
};

const getSourceNameVariants = (
  source: powerbi.DataViewMetadataColumn | null | undefined,
): Set<string> => {
  const variants = new Set<string>();
  for (const value of [source?.queryName, source?.displayName]) {
    const normalized = normalizeSourceName(value);
    if (normalized) {
      variants.add(normalized);
    }

    const lastSegment = value?.split(".").pop();
    const normalizedLastSegment = normalizeSourceName(lastSegment);
    if (normalizedLastSegment) {
      variants.add(normalizedLastSegment);
    }
  }

  return variants;
};

const sanitizeTooltipHtml = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return value
    .toString()
    .slice(0, tooltipHtmlMaxLength)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
};

const normalizeFeatureLabel = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
};

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const getGeometryCacheKey = (
  encoding: "wkt" | "wkp",
  geometryId: unknown,
  encoded: string,
): string =>
  `${encoding}:${String(geometryId)}:${encoded.length}:${hashString(encoded)}`;

const parseWkt = (
  wkt: string,
  geometryId: unknown,
  errorMessages: string[],
): Geometry | null => {
  if (!wkt || wkt.trim() === "") {
    return null;
  }
  try {
    const geojson = parseSync(wkt, WKTLoader);
    if (!geojson) {
      errorMessages.push(`Geometry ${geometryId}: invalid WKT geometry.`);
      return null;
    }
    return geojson as Geometry;
  } catch (error) {
    errorMessages.push(`Geometry ${geometryId}: invalid WKT geometry.`);
    return null;
  }
};

const parseWkp = (
  wkp: string,
  geometryId: unknown,
  errorMessages: string[],
): Geometry | null => {
  if (!wkp) {
    return null;
  }
  try {
    const geom = decodeAsGeometry(wkp);
    if (!geom) {
      errorMessages.push(`Geometry ${geometryId}: invalid encoded geometry.`);
      return null;
    }
    return geom;
  } catch (error) {
    errorMessages.push(
      `Geometry ${geometryId}: failed to decode WKP: ${error}`,
    );
    return null;
  }
};

/**
 * Cache keys `collectGeometryToDecode` already computed, per source column array and row, so the parse that
 * follows doesn't hash the same (often long) geometry strings a second time. Column arrays are immutable for
 * an update, so a key stored against one is valid for as long as the array lives.
 */
const geometryKeyMemo = new WeakMap<readonly unknown[], Array<string | undefined>>();

const parseCachedGeometry = (
  encoding: "wkt" | "wkp",
  encodedValue: unknown,
  geometryId: unknown,
  errorMessages: string[],
  geometryCache: GeometryCache,
  precomputedKey?: string,
): Geometry | null => {
  if (encodedValue === null || encodedValue === undefined) {
    return null;
  }

  const encoded = encodedValue.toString();
  const cacheKey = precomputedKey ?? getGeometryCacheKey(encoding, geometryId, encoded);
  const cached = geometryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const geometry =
    encoding === "wkt"
      ? parseWkt(encoded, geometryId, errorMessages)
      : parseWkp(encoded, geometryId, errorMessages);

  if (geometry) {
    geometryCache.set(cacheKey, geometry);
  }
  return geometry;
};

const getRoleColumns = (
  values: powerbi.DataViewValueColumns | null | undefined,
  categories: powerbi.DataViewCategoryColumn[] = [],
): Partial<
  Record<
    keyof RowValues,
    powerbi.DataViewValueColumn | powerbi.DataViewCategoryColumn
  >
> => {
  const roleColumnCandidates: Partial<
    Record<keyof RowValues, RoleColumnCandidate[]>
  > = {};

  const addRoleColumnCandidates = (columns: RoleColumnCandidate[]) => {
    for (const column of columns) {
      const roles = column.source?.roles;
      if (!roles) {
        continue;
      }

      for (const [fieldName, roleName] of roleMappings) {
        if (roles[roleName]) {
          roleColumnCandidates[fieldName] ??= [];
          roleColumnCandidates[fieldName]!.push(column);
        }
      }
    }
  };

  const getGroupedSourceCategoryRoleColumns = (): RoleColumnCandidate[] => {
    const seriesSource = values?.source;
    if (!seriesSource?.roles) {
      return [];
    }

    const seriesNames = getSourceNameVariants(seriesSource);
    if (seriesNames.size === 0) {
      return [];
    }

    const matchingCategories = categories.filter((category) => {
      const categoryNames = getSourceNameVariants(category.source);

      return Array.from(categoryNames).some((categoryName) =>
        seriesNames.has(categoryName),
      );
    });

    return matchingCategories.flatMap((category) =>
      roleMappings
        .filter(([_fieldName, roleName]) => !!seriesSource.roles?.[roleName])
        .map(
          ([_fieldName, roleName]) =>
            ({
              ...category,
              source: {
                ...category.source,
                displayName:
                  seriesSource.displayName ?? category.source.displayName,
                queryName: seriesSource.queryName ?? category.source.queryName,
                roles: {
                  ...category.source.roles,
                  [roleName]: true,
                },
              },
            }) as powerbi.DataViewCategoryColumn,
        ),
    );
  };

  const rowCount = getRoleRowCount(values, categories);
  const coalesceRoleColumn = (
    fieldName: keyof RowValues,
    candidates: RoleColumnCandidate[],
  ): RoleColumnCandidate | null => {
    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    const mergedValues = Array.from({ length: rowCount }, (_value, index) => {
      const rowValues = candidates
        .map((column) => column.values?.[index] ?? null)
        .filter((value) => hasMeaningfulRoleValue(fieldName, value));

      if (rowValues.length === 0) {
        return null;
      }

      return mergeGroupedRoleValues(fieldName, rowValues) ?? rowValues[0];
    });

    if (
      !mergedValues.some((value) => hasMeaningfulRoleValue(fieldName, value))
    ) {
      return candidates[0];
    }

    return {
      source: candidates[0].source,
      values: mergedValues,
    };
  };

  addRoleColumnCandidates(getGroupedSourceCategoryRoleColumns());
  addRoleColumnCandidates(categories);
  addRoleColumnCandidates(
    getGroupedRoleColumns(
      values,
      rowCount,
      roleMappings,
      hasMeaningfulRoleValue,
      mergeGroupedRoleValues,
    ),
  );
  if (values) {
    addRoleColumnCandidates(values as RoleColumnCandidate[]);
  }

  const roleColumns: Partial<Record<keyof RowValues, RoleColumnCandidate>> = {};
  for (const [fieldName] of roleMappings) {
    const candidates = roleColumnCandidates[fieldName] ?? [];
    const roleColumn = coalesceRoleColumn(fieldName, candidates);
    if (roleColumn) {
      roleColumns[fieldName] = roleColumn;
    }
  }

  return roleColumns;
};

const hasMeaningfulRoleValue = (
  fieldName: keyof RowValues,
  value: powerbi.PrimitiveValue | null | undefined,
): boolean => {
  if (colorRoleFields.has(fieldName)) {
    const parsed = parseColorInput(value);
    return (
      parsed.rgbaColor !== null ||
      parsed.numericValue !== null ||
      parsed.categoricalValue !== null
    );
  }

  if (numericRoleFields.has(fieldName)) {
    return getStrictNumberFromValue(value) !== null;
  }

  return isMeaningfulPrimitiveValue(value);
};

const areNearlyEqual = (left: number, right: number): boolean => {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= groupedNumericTolerance * scale;
};

const mergeNumericGroupedValues = (values: number[]): number => {
  const firstValue = values[0];
  if (values.every((value) => areNearlyEqual(value, firstValue))) {
    return firstValue;
  }

  return values.reduce((sum, value) => sum + value, 0);
};

const mergeGroupedRoleValues = (
  fieldName: keyof RowValues,
  values: powerbi.PrimitiveValue[],
): powerbi.PrimitiveValue | null => {
  if (!colorRoleFields.has(fieldName)) {
    if (numericRoleFields.has(fieldName)) {
      const numericValues = values
        .map((value) => getStrictNumberFromValue(value))
        .filter((value): value is number => value !== null);
      return numericValues.length > 0
        ? mergeNumericGroupedValues(numericValues)
        : (values[0] ?? null);
    }

    return values[0] ?? null;
  }

  const numericValues = values
    .map((value) => parseColorInput(value).numericValue)
    .filter((value): value is number => value !== null);
  if (numericValues.length === values.length && numericValues.length > 0) {
    return mergeNumericGroupedValues(numericValues);
  }

  return values[0] ?? null;
};

const getColumnValues = (
  column: powerbi.DataViewValueColumn | powerbi.DataViewCategoryColumn | null,
): powerbi.PrimitiveValue[] | null => column?.values ?? null;

const getRowValues = (
  rowValueArrays: RowValueArrays,
  index: number,
): RowValues => ({
  geometryId: rowValueArrays.geometryId?.[index] ?? null,
  featureLabel: rowValueArrays.featureLabel?.[index] ?? null,
  labelPriority: rowValueArrays.labelPriority?.[index] ?? null,
  layerType: rowValueArrays.layerType?.[index] ?? null,
  wkp: rowValueArrays.wkp?.[index] ?? null,
  wkt: rowValueArrays.wkt?.[index] ?? null,
  point1Latitude: rowValueArrays.point1Latitude?.[index] ?? null,
  point1Longitude: rowValueArrays.point1Longitude?.[index] ?? null,
  point2Latitude: rowValueArrays.point2Latitude?.[index] ?? null,
  point2Longitude: rowValueArrays.point2Longitude?.[index] ?? null,
  scatterRadius: rowValueArrays.scatterRadius?.[index] ?? null,
  scatterElevation: rowValueArrays.scatterElevation?.[index] ?? null,
  heatmapWeight: rowValueArrays.heatmapWeight?.[index] ?? null,
  scatterLineColor: rowValueArrays.scatterLineColor?.[index] ?? null,
  scatterLineWidth: rowValueArrays.scatterLineWidth?.[index] ?? null,
  scatterFillColor: rowValueArrays.scatterFillColor?.[index] ?? null,
  lineLineWidth: rowValueArrays.lineLineWidth?.[index] ?? null,
  lineLineColor: rowValueArrays.lineLineColor?.[index] ?? null,
  pathWidth: rowValueArrays.pathWidth?.[index] ?? null,
  pathColor: rowValueArrays.pathColor?.[index] ?? null,
  polygonLineColor: rowValueArrays.polygonLineColor?.[index] ?? null,
  polygonLineWidth: rowValueArrays.polygonLineWidth?.[index] ?? null,
  polygonFillColor: rowValueArrays.polygonFillColor?.[index] ?? null,
  polygonExtrudeElevation:
    rowValueArrays.polygonExtrudeElevation?.[index] ?? null,
  arcLineWidth: rowValueArrays.arcLineWidth?.[index] ?? null,
  arcSourceColor: rowValueArrays.arcSourceColor?.[index] ?? null,
  arcTargetColor: rowValueArrays.arcTargetColor?.[index] ?? null,
  tooltip: rowValueArrays.tooltip?.[index] ?? null,
  timestamp: rowValueArrays.timestamp?.[index] ?? null,
});

const getDataPointType = (
  geomType: string | null,
  scatterString: string,
  lineString: string,
  arcString: string,
  pathString: string,
  polygonString: string,
): InputLayerType | null => {
  if (geomType === scatterString) {
    return InputLayerType.Scatter;
  }
  if (geomType === lineString) {
    return InputLayerType.Line;
  }
  if (geomType === arcString) {
    return InputLayerType.Arc;
  }
  if (geomType === pathString) {
    return InputLayerType.Path;
  }
  if (geomType === polygonString) {
    return InputLayerType.Polygon;
  }
  return null;
};

const getDataPointTypeFromGeometry = (
  geometry: Geometry | null,
): InputLayerType | null => {
  if (!geometry) {
    return null;
  }

  if (geometry.type === "LineString" || geometry.type === "MultiLineString") {
    return InputLayerType.Path;
  }

  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    return InputLayerType.Polygon;
  }

  return null;
};

const dataPointTypeRoleEvidence: Array<
  [InputLayerType, Array<keyof RowValues>]
> = [
  [
    InputLayerType.Scatter,
    [
      "scatterRadius",
      "scatterElevation",
      "heatmapWeight",
      "scatterLineColor",
      "scatterLineWidth",
      "scatterFillColor",
    ],
  ],
  [InputLayerType.Line, ["lineLineWidth", "lineLineColor"]],
  [InputLayerType.Path, ["pathWidth", "pathColor"]],
  [
    InputLayerType.Polygon,
    [
      "polygonLineColor",
      "polygonLineWidth",
      "polygonFillColor",
      "polygonExtrudeElevation",
    ],
  ],
  [InputLayerType.Arc, ["arcLineWidth", "arcSourceColor", "arcTargetColor"]],
];

const getDataPointTypeFromRoleValues = (
  rowValues: RowValues,
): InputLayerType | null => {
  const matchingTypes = dataPointTypeRoleEvidence
    .filter(([_dataType, roleNames]) =>
      roleNames.some((roleName) =>
        hasMeaningfulRoleValue(roleName, rowValues[roleName]),
      ),
    )
    .map(([dataType]) => dataType);

  return matchingTypes.length === 1 ? matchingTypes[0] : null;
};

const addDataPointToLayerStore = (layerData: LayerDataStore, data: OurData) => {
  layerData.all.push(data);

  if (data.type === InputLayerType.Scatter) {
    layerData.scatter.push(data);
  } else if (data.type === InputLayerType.Line) {
    layerData.line.push(data);
  } else if (data.type === InputLayerType.Arc) {
    layerData.arc.push(data);
  } else if (
    data.type === InputLayerType.Path &&
    data.pathData &&
    data.pathProperties
  ) {
    layerData.path.push({
      type: "Feature",
      geometry: data.pathData,
      properties: {
        ...data.pathProperties,
        id: String(data.id),
        tooltipHtml: data.tooltipHtml,
      },
      selectionId: data.selectionId,
      tooltipHtml: data.tooltipHtml,
      id: String(data.id),
      labelText: data.labelText,
      labelPriority: data.labelPriority,
      sourceOrder: data.sourceOrder,
      hasZ: geometryHasZ(data.pathData),
      timestampSeconds: data.timestampSeconds,
    });
  } else if (
    data.type === InputLayerType.Polygon &&
    data.polygonData &&
    data.polygonProperties
  ) {
    layerData.polygon.push({
      type: "Feature",
      geometry: data.polygonData,
      properties: {
        ...data.polygonProperties,
        id: String(data.id),
        tooltipHtml: data.tooltipHtml,
      },
      selectionId: data.selectionId,
      tooltipHtml: data.tooltipHtml,
      id: String(data.id),
      labelText: data.labelText,
      labelPriority: data.labelPriority,
      sourceOrder: data.sourceOrder,
      hasZ: geometryHasZ(data.polygonData),
      timestampSeconds: data.timestampSeconds,
    });
  }
};

const updateDataPointColorRoleStats = (
  colorRoles: ColorRoleStatsStore,
  data: OurData,
) => {
  if (data.scatterProperties) {
    updateColorRoleStats(
      colorRoles,
      "scatterFillColor",
      data.scatterProperties.fillColor,
      data.scatterProperties.fillColorValue,
      data.scatterProperties.fillColorCategory,
    );
    updateColorRoleStats(
      colorRoles,
      "scatterLineColor",
      data.scatterProperties.lineColor,
      data.scatterProperties.lineColorValue,
      data.scatterProperties.lineColorCategory,
    );
  }

  if (data.lineProperties) {
    updateColorRoleStats(
      colorRoles,
      "lineLineColor",
      data.lineProperties.lineColor,
      data.lineProperties.lineColorValue,
      data.lineProperties.lineColorCategory,
    );
  }

  if (data.pathProperties) {
    updateColorRoleStats(
      colorRoles,
      "pathColor",
      data.pathProperties.lineColor,
      data.pathProperties.lineColorValue,
      data.pathProperties.lineColorCategory,
    );
  }

  if (data.polygonProperties) {
    updateColorRoleStats(
      colorRoles,
      "polygonFillColor",
      data.polygonProperties.fillColor,
      data.polygonProperties.fillColorValue,
      data.polygonProperties.fillColorCategory,
    );
    updateColorRoleStats(
      colorRoles,
      "polygonLineColor",
      data.polygonProperties.lineColor,
      data.polygonProperties.lineColorValue,
      data.polygonProperties.lineColorCategory,
    );
  }

  if (data.arcProperties) {
    updateColorRoleStats(
      colorRoles,
      "arcSourceColor",
      data.arcProperties.sourceColor,
      data.arcProperties.sourceColorValue,
      data.arcProperties.sourceColorCategory,
    );
    updateColorRoleStats(
      colorRoles,
      "arcTargetColor",
      data.arcProperties.targetColor,
      data.arcProperties.targetColorValue,
      data.arcProperties.targetColorCategory,
    );
  }
};

const hasVisibleScatterElevation = (data: OurData): boolean => {
  const elevation = data.scatterData?.elevation;
  return (
    typeof elevation === "number" &&
    Number.isFinite(elevation) &&
    elevation !== 0
  );
};

/**
 * Resume parsing from a previous snapshot when Power BI appends a fetchMoreData segment. In segment aggregation
 * mode each update carries every row loaded so far, so rows [0, previous.parsedRowCount) are unchanged and only
 * the new tail is parsed. `final` marks the last segment: bounds and time domain are then recomputed exactly
 * (intermediate segments merge them, which is enough because fly-to only runs after the last segment).
 * The previous snapshot's lookup maps are reused, so it must not be read after the append.
 */
export interface DatasetAppend {
  previous: DatasetSnapshot;
  final: boolean;
}

const cloneLayerStore = (store: LayerDataStore): LayerDataStore => ({
  all: store.all.slice(),
  scatter: store.scatter.slice(),
  line: store.line.slice(),
  arc: store.arc.slice(),
  path: store.path.slice(),
  polygon: store.polygon.slice(),
});

const cloneColorRoles = (store: ColorRoleStatsStore): ColorRoleStatsStore =>
  Object.fromEntries(
    Object.entries(store).map(([key, stats]) => [
      key,
      { ...stats, categoryCounts: new Map(stats.categoryCounts), categoryOrder: stats.categoryOrder.slice() },
    ]),
  ) as ColorRoleStatsStore;

const mergeBounds = (left: BoundingBox | null, right: BoundingBox | null): BoundingBox | null => {
  if (!left) return right;
  if (!right) return left;
  return {
    minLon: Math.min(left.minLon, right.minLon),
    minLat: Math.min(left.minLat, right.minLat),
    maxLon: Math.max(left.maxLon, right.maxLon),
    maxLat: Math.max(left.maxLat, right.maxLat),
  };
};

const mergeTimeDomains = (left: TimeDomain | null, right: TimeDomain | null): TimeDomain | null => {
  if (!left) return right;
  if (!right) return left;
  return { t0: Math.min(left.t0, right.t0), t1: Math.max(left.t1, right.t1) };
};

const getLayerTypeStrings = (settings: VisualFormattingSettingsModel) => ({
  scatterString: settings.scatter.layerType.value.trim().toLowerCase(),
  lineString: settings.line.layerType.value.trim().toLowerCase(),
  arcString: settings.arc.layerType.value.trim().toLowerCase(),
  pathString: settings.path.layerType.value.trim().toLowerCase(),
  polygonString: settings.polygon.layerType.value.trim().toLowerCase(),
});

/** Identifies what a parse depends on besides row values; an append only resumes when this is unchanged. */
const getParseKey = (
  roleColumns: Partial<Record<keyof RowValues, RoleColumnCandidate>>,
  geometryIdValue: powerbi.DataViewCategoryColumn,
  settings: VisualFormattingSettingsModel,
): string => {
  const types = getLayerTypeStrings(settings);
  return JSON.stringify([
    Object.entries(roleColumns).map(([role, column]) => [role, column?.source?.queryName ?? null]),
    geometryIdValue.source?.queryName ?? null,
    types.scatterString,
    types.lineString,
    types.arcString,
    types.pathString,
    types.polygonString,
    settings.validation.validateGeometries.value,
  ]);
};

/** Geometry strings to decode off the main thread, keyed exactly as the mapper's geometry cache. */
export interface GeometryDecodeRequest {
  keys: string[];
  /** 0 = WKT, 1 = WKP, per value. */
  encodings: Uint8Array;
  values: string[];
}

/**
 * Collect the WKT/WKP strings that `createDatasetSnapshot` would parse and that aren't cached yet. It follows
 * the same rules: only rows that are (or may be) paths or polygons, WKT before WKP, and only rows after
 * `previous.parsedRowCount` when the append will resume from it.
 */
export function collectGeometryToDecode(
  options: VisualUpdateOptions,
  settings: VisualFormattingSettingsModel,
  geometryCache: GeometryCache,
  previous: DatasetSnapshot | null,
): GeometryDecodeRequest {
  const request: GeometryDecodeRequest = { keys: [], encodings: new Uint8Array(0), values: [] };
  const categorical = options.dataViews?.[0]?.categorical;
  const geometryIdValue = categorical?.categories?.[0];
  if (!categorical || !geometryIdValue) return request;
  const roleColumns = getRoleColumns(categorical.values, categorical.categories);
  const wkt = getColumnValues(roleColumns.wkt ?? null);
  const wkp = getColumnValues(roleColumns.wkp ?? null);
  const layerType = getColumnValues(roleColumns.layerType ?? null);
  const ids = geometryIdValue.values;
  if ((!wkt && !wkp) || !layerType || !ids) return request;

  const types = getLayerTypeStrings(settings);
  const simpleTypes = new Set([types.scatterString, types.lineString, types.arcString]);
  const complexTypes = new Set([types.pathString, types.polygonString]);
  const firstRow =
    previous &&
    previous.parsedRowCount > 0 &&
    previous.parsedRowCount <= ids.length &&
    previous.parseKey === getParseKey(roleColumns, geometryIdValue, settings)
      ? previous.parsedRowCount
      : 0;
  const rowValueArrays = { geometryId: ids } as RowValueArrays;
  for (const [field] of roleMappings) {
    rowValueArrays[field] = getColumnValues(roleColumns[field] ?? null);
  }

  const encodings: number[] = [];
  const seen = new Set<string>();
  const wktKeys = wkt ? new Array<string | undefined>(ids.length) : null;
  const wkpKeys = wkp ? new Array<string | undefined>(ids.length) : null;
  if (wkt && wktKeys) geometryKeyMemo.set(wkt, wktKeys);
  if (wkp && wkpKeys) geometryKeyMemo.set(wkp, wkpKeys);
  for (let index = firstRow; index < ids.length; index += 1) {
    const geomType = layerType[index] ? layerType[index]!.toString().trim().toLowerCase() : null;
    if (geomType !== null && simpleTypes.has(geomType)) continue;
    if (geomType === null || !complexTypes.has(geomType)) {
      // Unknown type: the mapper infers it from role values, and only parses geometry if that fails or
      // points at a path/polygon.
      const inferred = getDataPointTypeFromRoleValues(getRowValues(rowValueArrays, index));
      if (inferred !== null && inferred !== InputLayerType.Path && inferred !== InputLayerType.Polygon) continue;
    }
    const wktValue = wkt?.[index];
    const useWkt = wkt !== null && wktValue !== null && wktValue !== undefined && wktValue.toString().trim() !== "";
    const raw = useWkt ? wktValue : wkp?.[index];
    if (raw === null || raw === undefined || raw === "" || raw === false) continue;
    const encoded = raw.toString();
    const key = getGeometryCacheKey(useWkt ? "wkt" : "wkp", ids[index] ?? null, encoded);
    (useWkt ? wktKeys : wkpKeys)![index] = key;
    if (geometryCache.has(key) || seen.has(key)) continue;
    seen.add(key);
    request.keys.push(key);
    request.values.push(encoded);
    encodings.push(useWkt ? 0 : 1);
  }
  request.encodings = Uint8Array.from(encodings);
  return request;
}

/** Put decoded geometry into the cache; rows the decoder left empty are parsed by the mapper as before. */
export function storeDecodedGeometry(
  geometryCache: GeometryCache,
  keys: string[],
  chunks: Array<{ start: number; batch: PackedGeometryBatch }>,
): number {
  let stored = 0;
  for (const { start, batch } of chunks) {
    for (let row = 0; row < batch.count; row += 1) {
      const geometry = unpackGeometry(batch, row);
      if (geometry) {
        geometryCache.set(keys[start + row], geometry);
        stored += 1;
      }
    }
  }
  return stored;
}

export function createDatasetSnapshot(
  options: VisualUpdateOptions,
  settings: VisualFormattingSettingsModel,
  host: IVisualHost,
  geometryCache: GeometryCache,
  version: string,
  append: DatasetAppend | null = null,
): DatasetSnapshot {
  let layerData = createEmptyLayerDataStore();
  let colorRoles = createEmptyColorRoleStatsStore();
  let idToDataPoint = new Map<string, OurData>();
  let idToSelectionId = new Map<string, ISelectionId>();
  let dataHighlightedIds: string[] = [];
  const emptySnapshot = (): DatasetSnapshot => ({
    layers: layerData,
    colorRoles,
    idToDataPoint,
    idToSelectionId,
    dataHighlightedIds,
    bounds: null,
    version,
    timeDomain: null,
    elevationFieldBound: false,
    scatterElevationFieldBound: false,
    scatterHasVisibleElevation: false,
    parsedRowCount: 0,
    parseKey: "",
  });

  const dataViews = options.dataViews;
  if (!dataViews || !dataViews[0]) {
    return emptySnapshot();
  }
  if (dataViews.length > 1) {
    host.displayWarningIcon(
      "Multiple dataviews found.",
      "This visual only supports a single dataview. Please remove any extra dataviews.",
    );
  }
  const categorical = dataViews[0].categorical;
  if (!categorical || !categorical.categories) {
    return emptySnapshot();
  }
  const geometryIdValue = categorical.categories[0];
  if (!geometryIdValue) {
    return emptySnapshot();
  }

  const roleColumns = getRoleColumns(
    categorical.values,
    categorical.categories,
  );
  const layerTypeValue = roleColumns.layerType;
  if (!layerTypeValue) {
    return emptySnapshot();
  }

  const rowValueArrays: RowValueArrays = {
    geometryId: getColumnValues(geometryIdValue),
    featureLabel: getColumnValues(roleColumns.featureLabel ?? null),
    labelPriority: getColumnValues(roleColumns.labelPriority ?? null),
    layerType: getColumnValues(layerTypeValue),
    wkp: getColumnValues(roleColumns.wkp ?? null),
    wkt: getColumnValues(roleColumns.wkt ?? null),
    point1Latitude: getColumnValues(roleColumns.point1Latitude ?? null),
    point1Longitude: getColumnValues(roleColumns.point1Longitude ?? null),
    point2Latitude: getColumnValues(roleColumns.point2Latitude ?? null),
    point2Longitude: getColumnValues(roleColumns.point2Longitude ?? null),
    scatterRadius: getColumnValues(roleColumns.scatterRadius ?? null),
    scatterElevation: getColumnValues(roleColumns.scatterElevation ?? null),
    heatmapWeight: getColumnValues(roleColumns.heatmapWeight ?? null),
    scatterLineColor: getColumnValues(roleColumns.scatterLineColor ?? null),
    scatterLineWidth: getColumnValues(roleColumns.scatterLineWidth ?? null),
    scatterFillColor: getColumnValues(roleColumns.scatterFillColor ?? null),
    lineLineWidth: getColumnValues(roleColumns.lineLineWidth ?? null),
    lineLineColor: getColumnValues(roleColumns.lineLineColor ?? null),
    pathWidth: getColumnValues(roleColumns.pathWidth ?? null),
    pathColor: getColumnValues(roleColumns.pathColor ?? null),
    polygonLineColor: getColumnValues(roleColumns.polygonLineColor ?? null),
    polygonLineWidth: getColumnValues(roleColumns.polygonLineWidth ?? null),
    polygonFillColor: getColumnValues(roleColumns.polygonFillColor ?? null),
    polygonExtrudeElevation: getColumnValues(
      roleColumns.polygonExtrudeElevation ?? null,
    ),
    arcLineWidth: getColumnValues(roleColumns.arcLineWidth ?? null),
    arcSourceColor: getColumnValues(roleColumns.arcSourceColor ?? null),
    arcTargetColor: getColumnValues(roleColumns.arcTargetColor ?? null),
    tooltip: getColumnValues(roleColumns.tooltip ?? null),
    timestamp: getColumnValues(roleColumns.timestamp ?? null),
  };

  if (!rowValueArrays.geometryId || !rowValueArrays.layerType) {
    return emptySnapshot();
  }

  const isProvided: RowValueAvailability = {
    geometryId: !!rowValueArrays.geometryId,
    featureLabel: !!rowValueArrays.featureLabel,
    labelPriority: !!rowValueArrays.labelPriority,
    layerType: !!rowValueArrays.layerType,
    wkp: !!rowValueArrays.wkp,
    wkt: !!rowValueArrays.wkt,
    point1Latitude: !!rowValueArrays.point1Latitude,
    point1Longitude: !!rowValueArrays.point1Longitude,
    point2Latitude: !!rowValueArrays.point2Latitude,
    point2Longitude: !!rowValueArrays.point2Longitude,
    scatterRadius: !!rowValueArrays.scatterRadius,
    scatterElevation: !!rowValueArrays.scatterElevation,
    heatmapWeight: !!rowValueArrays.heatmapWeight,
    scatterLineColor: !!rowValueArrays.scatterLineColor,
    scatterLineWidth: !!rowValueArrays.scatterLineWidth,
    scatterFillColor: !!rowValueArrays.scatterFillColor,
    lineLineWidth: !!rowValueArrays.lineLineWidth,
    lineLineColor: !!rowValueArrays.lineLineColor,
    pathWidth: !!rowValueArrays.pathWidth,
    pathColor: !!rowValueArrays.pathColor,
    polygonLineColor: !!rowValueArrays.polygonLineColor,
    polygonLineWidth: !!rowValueArrays.polygonLineWidth,
    polygonFillColor: !!rowValueArrays.polygonFillColor,
    polygonExtrudeElevation: !!rowValueArrays.polygonExtrudeElevation,
    arcLineWidth: !!rowValueArrays.arcLineWidth,
    arcSourceColor: !!rowValueArrays.arcSourceColor,
    arcTargetColor: !!rowValueArrays.arcTargetColor,
    tooltip: !!rowValueArrays.tooltip,
    timestamp: !!rowValueArrays.timestamp,
  };

  const errorMessages: string[] = [];
  const { scatterString, lineString, arcString, pathString, polygonString } = getLayerTypeStrings(settings);
  const validateGeometries = settings.validation.validateGeometries.value;
  const parseKey = getParseKey(roleColumns, geometryIdValue, settings);
  const rowCount = rowValueArrays.geometryId.length;
  const previous =
    append &&
    append.previous.parseKey === parseKey &&
    append.previous.parsedRowCount > 0 &&
    append.previous.parsedRowCount <= rowCount
      ? append.previous
      : null;
  const firstRow = previous ? previous.parsedRowCount : 0;
  if (previous) {
    // The previous snapshot is replaced by this one, so its lookup maps are taken over rather than copied:
    // copying them on every segment made a segmented load quadratic in the row count. Layer arrays are still
    // sliced because deck.gl detects data changes by array identity.
    layerData = cloneLayerStore(previous.layers);
    colorRoles = cloneColorRoles(previous.colorRoles);
    idToDataPoint = previous.idToDataPoint;
    idToSelectionId = previous.idToSelectionId;
    dataHighlightedIds = previous.dataHighlightedIds;
  }
  const firstNewPoint = layerData.all.length;
  const highlightColumns = (categorical.values ?? []).filter((valueColumn) =>
    Array.isArray(valueColumn?.highlights),
  );
  const hasAnyDataHighlights = highlightColumns.some((valueColumn) =>
    valueColumn.highlights?.some(
      (value) => value !== null && value !== undefined,
    ),
  );

  for (let index = firstRow, len = rowCount; index < len; index += 1) {
    const rowValues = getRowValues(rowValueArrays, index);
    const id = rowValues.geometryId;
    const selectionId: ISelectionId = host
      .createSelectionIdBuilder()
      .withCategory(geometryIdValue, index)
      .createSelectionId();
    const geomType = rowValues.layerType
      ? rowValues.layerType.toString().trim().toLowerCase()
      : null;
    let dataType = getDataPointType(
      geomType,
      scatterString,
      lineString,
      arcString,
      pathString,
      polygonString,
    );
    if (!dataType) {
      dataType = getDataPointTypeFromRoleValues(rowValues);
    }

    const needsComplexGeometry =
      dataType === InputLayerType.Path || dataType === InputLayerType.Polygon;
    let wktGeometry: Geometry | null = null;
    let wkpGeometry: Geometry | null = null;
    if (
      needsComplexGeometry ||
      (!dataType && (isProvided.wkt || isProvided.wkp))
    ) {
      if (isProvided.wkt && rowValues.wkt?.toString().trim()) {
        wktGeometry = parseCachedGeometry(
          "wkt",
          rowValues.wkt,
          rowValues.geometryId,
          errorMessages,
          geometryCache,
          geometryKeyMemo.get(rowValueArrays.wkt!)?.[index],
        );
      } else if (isProvided.wkp && rowValues.wkp) {
        wkpGeometry = parseCachedGeometry(
          "wkp",
          rowValues.wkp,
          rowValues.geometryId,
          errorMessages,
          geometryCache,
          geometryKeyMemo.get(rowValueArrays.wkp!)?.[index],
        );
      }
    }

    if (!dataType) {
      dataType = getDataPointTypeFromGeometry(wktGeometry ?? wkpGeometry);
    }

    if (!dataType) {
      errorMessages.push(`Geometry ${id}: unknown layer type ${geomType}`);
      continue;
    }

    const isHighlightedFromData =
      hasAnyDataHighlights &&
      highlightColumns.some(
        (valueColumn) =>
          valueColumn.highlights?.[index] !== null &&
          valueColumn.highlights?.[index] !== undefined,
      );
    const data: OurData = {
      id: String(rowValues.geometryId),
      labelText: normalizeFeatureLabel(rowValues.featureLabel),
      labelPriority: getStrictNumberFromValue(rowValues.labelPriority),
      sourceOrder: index,
      type: null,
      lineData: null,
      lineProperties: null,
      scatterData: null,
      scatterProperties: null,
      arcData: null,
      arcProperties: null,
      pathData: null,
      pathProperties: null,
      polygonData: null,
      polygonProperties: null,
      isHighlightedFromData,
      selectionId: selectionId,
      tooltipHtml: sanitizeTooltipHtml(rowValues.tooltip),
      timestampSeconds: toUnixSeconds(rowValues.timestamp),
    };

    if (dataType === InputLayerType.Scatter) {
      if (!parseScatter(isProvided, rowValues, errorMessages, data)) {
        continue;
      }
    } else if (dataType === InputLayerType.Line) {
      if (!parseLine(isProvided, rowValues, errorMessages, data)) {
        continue;
      }
    } else if (dataType === InputLayerType.Arc) {
      if (!parseArc(isProvided, rowValues, errorMessages, data)) {
        continue;
      }
    } else if (dataType === InputLayerType.Path) {
      if (
        !parsePath(wktGeometry, wkpGeometry, rowValues, errorMessages, data)
      ) {
        continue;
      }
    } else if (dataType === InputLayerType.Polygon) {
      if (
        !parsePolygon(wktGeometry, wkpGeometry, rowValues, errorMessages, data)
      ) {
        continue;
      }
    }

    if (data.type === null) {
      errorMessages.push(
        `Geometry ${id}: no geometry defined. Check that the layer type is correct and that WKT/WKP or point coordinates are provided as needed.`,
      );
      continue;
    }

    if (validateGeometries && !validateData(data)) {
      errorMessages.push(
        `Geometry ${id}: invalid coordinates found (latitude must be in [-90, 90], longitude in [-180, 180]).`,
      );
      continue;
    }

    const stringId = String(data.id);
    idToDataPoint.set(stringId, data);
    idToSelectionId.set(stringId, selectionId);
    if (isHighlightedFromData) {
      dataHighlightedIds.push(stringId);
    }
    updateDataPointColorRoleStats(colorRoles, data);
    addDataPointToLayerStore(layerData, data);
  }

  if (host && errorMessages.length > 0) {
    host.displayWarningIcon(
      "Data parsing error.",
      errorMessages.slice(0, 10).join("\n").slice(0, 500),
    );
  }

  const exact = !previous || append?.final;
  const newPoints = exact ? layerData.all : layerData.all.slice(firstNewPoint);
  const bounds = exact
    ? getDataBoundingBox(layerData.all)
    : mergeBounds(previous!.bounds, getDataBoundingBox(newPoints));
  const newTimeDomain = computeTimeDomain(newPoints.map((point) => point.timestampSeconds));
  return {
    layers: layerData,
    colorRoles,
    idToDataPoint,
    idToSelectionId,
    dataHighlightedIds,
    bounds,
    version,
    timeDomain: exact ? newTimeDomain : mergeTimeDomains(previous!.timeDomain, newTimeDomain),
    elevationFieldBound: isProvided.polygonExtrudeElevation,
    scatterElevationFieldBound: isProvided.scatterElevation,
    scatterHasVisibleElevation:
      (previous?.scatterHasVisibleElevation ?? false) ||
      newPoints.some((point) => point.type === InputLayerType.Scatter && hasVisibleScatterElevation(point)),
    parsedRowCount: rowCount,
    parseKey,
  };
}

export function createSelectorDataPoints(
  options: VisualUpdateOptions,
  settings: VisualFormattingSettingsModel,
  host: IVisualHost,
  geometryCache: GeometryCache,
): OurData[] {
  return createDatasetSnapshot(options, settings, host, geometryCache, "compat")
    .layers.all;
}
