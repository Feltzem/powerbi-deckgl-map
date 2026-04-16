import powerbi from "powerbi-visuals-api";
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import ISelectionId = powerbi.visuals.ISelectionId;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import { decodeAsGeometry } from "./encoding";
import { InputLayerType, LineData, OurData, RowValues } from "./dataTypes";
import { VisualFormattingSettingsModel } from "./settings";
import { WKTLoader } from "@loaders.gl/wkt";
import { parseSync } from "@loaders.gl/core";
import { Geometry, Polygon, MultiPolygon } from "geojson";
import { parsePath } from "./parsers/path";
import { parsePolygon } from "./parsers/polygon";
import { parseScatter } from "./parsers/scatter";
import { parseLine, parseArc } from "./parsers/lineArc";
import { validateData } from "./geom";

const parseWkt = (
  wkt: string,
  geometryId: any,
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
  geometryId: any,
  errorMessages: string[],
): Geometry | null => {
  if (!wkp) {
    return null;
  }
  try {
    const geom = decodeAsGeometry(wkp);
    if (geometryId === "path-02152a887c290ecc491c8a276ba82367") {
      console.log(wkp);
      console.log(geom);
    }
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

export function createSelectorDataPoints(
  options: VisualUpdateOptions,
  settings: VisualFormattingSettingsModel,
  host: IVisualHost,
  decodeCache: object,
): OurData[] {
  const dataPoints: OurData[] = [];
  const dataViews = options.dataViews;

  if (!dataViews || !dataViews[0]) {
    return dataPoints;
  }
  if (dataViews.length > 1) {
    host.displayWarningIcon(
      "Multiple dataviews found.",
      "This visual only supports a single dataview. Please remove any extra dataviews.",
    );
  }
  const categorical = dataViews[0].categorical;
  if (!categorical || !categorical.categories || !categorical.values) {
    return dataPoints;
  }
  const geometryIdValue = categorical.categories[0];
  if (!geometryIdValue) {
    // No index (usually CTUID)
    return dataPoints;
  }
  console.log("Processing n rows of data:", geometryIdValue.values.length);
  const layerTypeValue = categorical.values.filter(
    (x) => x.source.roles.layerType,
  )[0];
  if (!layerTypeValue) {
    return dataPoints;
  }

  const hasAnyDataHighlights = categorical.values.some((valueColumn: any) => {
    const highlights = valueColumn?.highlights;
    return (
      Array.isArray(highlights) &&
      highlights.some((v) => v !== null && v !== undefined)
    );
  });

  const categoricalValues: RowValues = {
    geometryId: geometryIdValue,
    layerType: layerTypeValue,
    wkp: categorical.values.filter((x) => x.source.roles.wkp)[0],
    wkt: categorical.values.filter((x) => x.source.roles.wkt)[0],
    point1Latitude: categorical.values.filter(
      (x) => x.source.roles.point1Latitude,
    )[0],
    point1Longitude: categorical.values.filter(
      (x) => x.source.roles.point1Longitude,
    )[0],
    point2Latitude: categorical.values.filter(
      (x) => x.source.roles.point2Latitude,
    )[0],
    point2Longitude: categorical.values.filter(
      (x) => x.source.roles.point2Longitude,
    )[0],
    scatterRadius: categorical.values.filter(
      (x) => x.source.roles.scatterRadius,
    )[0],
    scatterLineColor: categorical.values.filter(
      (x) => x.source.roles.scatterLineColor,
    )[0],
    scatterLineWidth: categorical.values.filter(
      (x) => x.source.roles.scatterLineWidth,
    )[0],
    scatterFillColor: categorical.values.filter(
      (x) => x.source.roles.scatterFillColor,
    )[0],
    lineLineWidth: categorical.values.filter(
      (x) => x.source.roles.lineLineWidth,
    )[0],
    lineLineColor: categorical.values.filter(
      (x) => x.source.roles.lineLineColor,
    )[0],
    pathWidth: categorical.values.filter((x) => x.source.roles.pathWidth)[0],
    pathColor: categorical.values.filter((x) => x.source.roles.pathColor)[0],
    polygonLineColor: categorical.values.filter(
      (x) => x.source.roles.polygonLineColor,
    )[0],
    polygonLineWidth: categorical.values.filter(
      (x) => x.source.roles.polygonLineWidth,
    )[0],
    polygonFillColor: categorical.values.filter(
      (x) => x.source.roles.polygonFillColor,
    )[0],
    polygonExtrudeElevation: categorical.values.filter(
      (x) => x.source.roles.polygonExtrudeElevation,
    )[0],
    arcLineWidth: categorical.values.filter(
      (x) => x.source.roles.arcLineWidth,
    )[0],
    arcSourceColor: categorical.values.filter(
      (x) => x.source.roles.arcSourceColor,
    )[0],
    arcTargetColor: categorical.values.filter(
      (x) => x.source.roles.arcTargetColor,
    )[0],
    tooltip: categorical.values.filter((x) => x.source.roles.tooltipHtml)[0],
  };

  const rowValueArrays: RowValues = Object.fromEntries(
    Object.entries(categoricalValues).map(([key, value]) => [
      key,
      value ? value.values : null,
    ]),
  ) as RowValues;

  const isProvided: RowValues = Object.fromEntries(
    Object.entries(rowValueArrays).map(([key, value]) => [key, !!value as any]),
  ) as RowValues;

  const errorMessages = [];
  const scatterString = settings.scatter.layerType.value.trim().toLowerCase();
  const lineString = settings.line.layerType.value.trim().toLowerCase();
  const arcString = settings.arc.layerType.value.trim().toLowerCase();
  const pathString = settings.path.layerType.value.trim().toLowerCase();
  const polygonString = settings.polygon.layerType.value.trim().toLowerCase();
  const validateGeometries = settings.validation.validateGeometries.value;

  console.log(`[validation] validateGeometries is ${validateGeometries}`);

  for (let i = 0, len = rowValueArrays.geometryId.length; i < len; i++) {
    const rowValues: RowValues = Object.fromEntries(
      Object.entries(rowValueArrays).map(([key, value]) => [
        key,
        value ? value[i] : null,
      ]),
    ) as RowValues;
    const id = rowValues.geometryId;
    const selectionId: ISelectionId = host
      .createSelectionIdBuilder()
      .withCategory(geometryIdValue, i)
      .createSelectionId();
    const geomType = rowValues.layerType
      ? rowValues.layerType.toString().trim().toLowerCase()
      : null;
    const wktGeometry = isProvided.wkt
      ? parseWkt(rowValues.wkt, rowValues.geometryId, errorMessages)
      : null;
    const wkpGeometry = isProvided.wkp
      ? parseWkp(rowValues.wkp, rowValues.geometryId, errorMessages)
      : null;

    const data: OurData = {
      id: rowValues.geometryId,
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
      isHighlightedFromData:
        hasAnyDataHighlights &&
        categorical.values.some((valueColumn: any) => {
          const highlights = valueColumn?.highlights;
          return (
            Array.isArray(highlights) &&
            highlights[i] !== null &&
            highlights[i] !== undefined
          );
        }),
      selectionId: selectionId,
      tooltipHtml: rowValues.tooltip?.toString(),
    };
    if (geomType === scatterString) {
      if (!parseScatter(isProvided, rowValues, errorMessages, data)) {
        continue;
      }
    } else if (geomType === lineString) {
      if (!parseLine(isProvided, rowValues, errorMessages, data)) {
        console.log(
          `Failed to parse line geometry with id ${id}, skipping this geometry.`,
        );
        continue;
      }
    } else if (geomType === arcString) {
      if (!parseArc(isProvided, rowValues, errorMessages, data)) {
        continue;
      }
    } else if (geomType === pathString) {
      if (
        !parsePath(wktGeometry, wkpGeometry, rowValues, errorMessages, data)
      ) {
        continue;
      }
    } else if (geomType === polygonString) {
      if (
        !parsePolygon(wktGeometry, wkpGeometry, rowValues, errorMessages, data)
      ) {
        continue;
      }
    } else {
      errorMessages.push(`Geometry ${id}: unknown layer type ${geomType}`);
      continue;
    }

    // Bail if no geometry defined:
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

    dataPoints.push(data);
  }

  if (host && errorMessages.length > 0) {
    host.displayWarningIcon(
      "Data parsing error.",
      errorMessages.slice(0, 10).join("\n").slice(0, 500),
    );
  }

  return dataPoints;
}
