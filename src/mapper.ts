import powerbi from "powerbi-visuals-api";
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import ISelectionId = powerbi.visuals.ISelectionId;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import { decodeAsGeometry } from "./encoding";
import {
  DatasetSnapshot,
  ColorRoleStatsStore,
  GeometryCache,
  InputLayerType,
  LayerDataStore,
  OurData,
  RowValues,
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
import { parseColorInput } from "./powerbiUtils";
import {
  getGroupedRoleColumns,
  getRoleRowCount,
  isMeaningfulPrimitiveValue,
  RoleColumn,
} from "./roleColumnUtils";

const roleMappings: Array<[keyof RowValues, string]> = [
  ["layerType", "layerType"],
  ["wkp", "wkp"],
  ["wkt", "wkt"],
  ["point1Latitude", "point1Latitude"],
  ["point1Longitude", "point1Longitude"],
  ["point2Latitude", "point2Latitude"],
  ["point2Longitude", "point2Longitude"],
  ["scatterRadius", "scatterRadius"],
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

const tooltipHtmlMaxLength = 4000;

const createEmptyLayerDataStore = (): LayerDataStore => ({
  all: [],
  scatter: [],
  line: [],
  arc: [],
  path: [],
  polygon: [],
});

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

const parseCachedGeometry = (
  encoding: "wkt" | "wkp",
  encodedValue: unknown,
  geometryId: unknown,
  errorMessages: string[],
  geometryCache: GeometryCache,
): Geometry | null => {
  if (encodedValue === null || encodedValue === undefined) {
    return null;
  }

  const encoded = encodedValue.toString();
  const cacheKey = getGeometryCacheKey(encoding, geometryId, encoded);
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
  Record<keyof RowValues, powerbi.DataViewValueColumn | powerbi.DataViewCategoryColumn>
> => {
  const roleColumnCandidates: Partial<Record<keyof RowValues, RoleColumnCandidate[]>> = {};

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

  const rowCount = getRoleRowCount(values, categories);
  addRoleColumnCandidates(
    getGroupedRoleColumns(values, rowCount, roleMappings, hasMeaningfulRoleValue),
  );
  if (values) {
    addRoleColumnCandidates(values as RoleColumnCandidate[]);
  }
  addRoleColumnCandidates(categories);

  const roleColumns: Partial<Record<keyof RowValues, RoleColumnCandidate>> = {};
  for (const [fieldName] of roleMappings) {
    const candidates = roleColumnCandidates[fieldName] ?? [];
    if (candidates.length === 0) {
      continue;
    }

    const meaningfulCandidate = candidates.find((column) =>
      hasMeaningfulRoleValues(fieldName, column),
    );
    const roleColumn = meaningfulCandidate ?? candidates[0];
    if (roleColumn) {
      roleColumns[fieldName] = roleColumn;
    }
  }

  return roleColumns;
};

const hasMeaningfulRoleValues = (
  fieldName: keyof RowValues,
  column: RoleColumnCandidate,
): boolean => {
  const values = column.values ?? [];
  return values.some((value) => hasMeaningfulRoleValue(fieldName, value));
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

  return isMeaningfulPrimitiveValue(value);
};

const getColumnValues = (
  column: powerbi.DataViewValueColumn | powerbi.DataViewCategoryColumn | null,
): powerbi.PrimitiveValue[] | null => column?.values ?? null;

const getRowValues = (
  rowValueArrays: RowValues,
  index: number,
): RowValues => ({
  geometryId: rowValueArrays.geometryId?.[index] ?? null,
  layerType: rowValueArrays.layerType?.[index] ?? null,
  wkp: rowValueArrays.wkp?.[index] ?? null,
  wkt: rowValueArrays.wkt?.[index] ?? null,
  point1Latitude: rowValueArrays.point1Latitude?.[index] ?? null,
  point1Longitude: rowValueArrays.point1Longitude?.[index] ?? null,
  point2Latitude: rowValueArrays.point2Latitude?.[index] ?? null,
  point2Longitude: rowValueArrays.point2Longitude?.[index] ?? null,
  scatterRadius: rowValueArrays.scatterRadius?.[index] ?? null,
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

const addDataPointToLayerStore = (
  layerData: LayerDataStore,
  data: OurData,
) => {
  layerData.all.push(data);

  if (data.type === InputLayerType.Scatter) {
    layerData.scatter.push(data);
  } else if (data.type === InputLayerType.Line) {
    layerData.line.push(data);
  } else if (data.type === InputLayerType.Arc) {
    layerData.arc.push(data);
  } else if (data.type === InputLayerType.Path && data.pathData && data.pathProperties) {
    layerData.path.push({
      type: "Feature",
      geometry: data.pathData,
      properties: data.pathProperties,
      selectionId: data.selectionId,
      tooltipHtml: data.tooltipHtml,
      id: String(data.id),
    });
  } else if (
    data.type === InputLayerType.Polygon &&
    data.polygonData &&
    data.polygonProperties
  ) {
    layerData.polygon.push({
      type: "Feature",
      geometry: data.polygonData,
      properties: data.polygonProperties,
      selectionId: data.selectionId,
      tooltipHtml: data.tooltipHtml,
      id: String(data.id),
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

export function createDatasetSnapshot(
  options: VisualUpdateOptions,
  settings: VisualFormattingSettingsModel,
  host: IVisualHost,
  geometryCache: GeometryCache,
  version: string,
): DatasetSnapshot {
  const layerData = createEmptyLayerDataStore();
  const colorRoles = createEmptyColorRoleStatsStore();
  const idToDataPoint = new Map<string, OurData>();
  const idToSelectionId = new Map<string, ISelectionId>();
  const dataHighlightedIds: string[] = [];
  const emptySnapshot = (): DatasetSnapshot => ({
    layers: layerData,
    colorRoles,
    idToDataPoint,
    idToSelectionId,
    dataHighlightedIds,
    bounds: null,
    version,
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

  const roleColumns = getRoleColumns(categorical.values, categorical.categories);
  const layerTypeValue = roleColumns.layerType;
  if (!layerTypeValue) {
    return emptySnapshot();
  }

  const rowValueArrays: RowValues = {
    geometryId: getColumnValues(geometryIdValue),
    layerType: getColumnValues(layerTypeValue),
    wkp: getColumnValues(roleColumns.wkp ?? null),
    wkt: getColumnValues(roleColumns.wkt ?? null),
    point1Latitude: getColumnValues(roleColumns.point1Latitude ?? null),
    point1Longitude: getColumnValues(roleColumns.point1Longitude ?? null),
    point2Latitude: getColumnValues(roleColumns.point2Latitude ?? null),
    point2Longitude: getColumnValues(roleColumns.point2Longitude ?? null),
    scatterRadius: getColumnValues(roleColumns.scatterRadius ?? null),
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
  };

  if (!rowValueArrays.geometryId || !rowValueArrays.layerType) {
    return emptySnapshot();
  }

  const isProvided: RowValues = {
    geometryId: !!rowValueArrays.geometryId,
    layerType: !!rowValueArrays.layerType,
    wkp: !!rowValueArrays.wkp,
    wkt: !!rowValueArrays.wkt,
    point1Latitude: !!rowValueArrays.point1Latitude,
    point1Longitude: !!rowValueArrays.point1Longitude,
    point2Latitude: !!rowValueArrays.point2Latitude,
    point2Longitude: !!rowValueArrays.point2Longitude,
    scatterRadius: !!rowValueArrays.scatterRadius,
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
  };

  const errorMessages: string[] = [];
  const scatterString = settings.scatter.layerType.value.trim().toLowerCase();
  const lineString = settings.line.layerType.value.trim().toLowerCase();
  const arcString = settings.arc.layerType.value.trim().toLowerCase();
  const pathString = settings.path.layerType.value.trim().toLowerCase();
  const polygonString = settings.polygon.layerType.value.trim().toLowerCase();
  const validateGeometries = settings.validation.validateGeometries.value;
  const highlightColumns = categorical.values.filter((valueColumn: any) =>
    Array.isArray(valueColumn?.highlights),
  );
  const hasAnyDataHighlights = highlightColumns.some((valueColumn: any) =>
    valueColumn.highlights.some((v) => v !== null && v !== undefined),
  );

  for (let index = 0, len = rowValueArrays.geometryId.length; index < len; index += 1) {
    const rowValues = getRowValues(rowValueArrays, index);
    const id = rowValues.geometryId;
    const selectionId: ISelectionId = host
      .createSelectionIdBuilder()
      .withCategory(geometryIdValue, index)
      .createSelectionId();
    const geomType = rowValues.layerType
      ? rowValues.layerType.toString().trim().toLowerCase()
      : null;
    const dataType = getDataPointType(
      geomType,
      scatterString,
      lineString,
      arcString,
      pathString,
      polygonString,
    );

    if (!dataType) {
      errorMessages.push(`Geometry ${id}: unknown layer type ${geomType}`);
      continue;
    }

    const needsComplexGeometry =
      dataType === InputLayerType.Path || dataType === InputLayerType.Polygon;
    let wktGeometry: Geometry | null = null;
    let wkpGeometry: Geometry | null = null;
    if (needsComplexGeometry) {
      if (isProvided.wkt && rowValues.wkt?.toString().trim()) {
        wktGeometry = parseCachedGeometry(
          "wkt",
          rowValues.wkt,
          rowValues.geometryId,
          errorMessages,
          geometryCache,
        );
      } else if (isProvided.wkp && rowValues.wkp) {
        wkpGeometry = parseCachedGeometry(
          "wkp",
          rowValues.wkp,
          rowValues.geometryId,
          errorMessages,
          geometryCache,
        );
      }
    }

    const isHighlightedFromData =
      hasAnyDataHighlights &&
      highlightColumns.some(
        (valueColumn: any) =>
          valueColumn.highlights[index] !== null &&
          valueColumn.highlights[index] !== undefined,
      );
    const data: OurData = {
      id: String(rowValues.geometryId),
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

  return {
    layers: layerData,
    colorRoles,
    idToDataPoint,
    idToSelectionId,
    dataHighlightedIds,
    bounds: getDataBoundingBox(layerData.all),
    version,
  };
}

export function createSelectorDataPoints(
  options: VisualUpdateOptions,
  settings: VisualFormattingSettingsModel,
  host: IVisualHost,
  geometryCache: GeometryCache,
): OurData[] {
  return createDatasetSnapshot(
    options,
    settings,
    host,
    geometryCache,
    "compat",
  ).layers.all;
}
