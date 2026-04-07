import { Geometry, MultiPolygon, Polygon } from "geojson";
import { RowValues, OurData, InputLayerType } from "../dataTypes";
import { getNumberFromValue, parseColorInput } from "../powerbiUtils";

export const parsePolygon = (
  wktGeometry: Geometry,
  wkpGeometry: Geometry,
  rowValues: RowValues,
  errorMessages: string[],
  data: OurData,
): boolean => {
  let geometry: Polygon | MultiPolygon | null = null;
  const lineColor = parseColorInput(rowValues.polygonLineColor);
  const fillColor = parseColorInput(rowValues.polygonFillColor);
  const id = rowValues.geometryId;
  if (wktGeometry) {
    if (wktGeometry.type === "Polygon") {
      if (
        wktGeometry.coordinates.length === 0 ||
        !Array.isArray(wktGeometry.coordinates[0]) ||
        !Array.isArray(wktGeometry.coordinates[0][0])
      ) {
        errorMessages.push(`Geometry ${id}: invalid WKT polygon coordinates.`);
        return false;
      }
      geometry = wktGeometry;
    } else if (wktGeometry.type === "MultiPolygon") {
      if (
        wktGeometry.coordinates.length === 0 ||
        !Array.isArray(wktGeometry.coordinates[0]) ||
        !Array.isArray(wktGeometry.coordinates[0][0]) ||
        !Array.isArray(wktGeometry.coordinates[0][0][0])
      ) {
        errorMessages.push(
          `Geometry ${id}: invalid WKT multipolygon coordinates.`,
        );
        return false;
      }
      geometry = wktGeometry;
    } else {
      errorMessages.push(
        `Geometry ${id}: WKT geometry is not a polygon or multipolygon.`,
      );
      return false;
    }
  } else if (wkpGeometry) {
    if (wkpGeometry.type === "Polygon") {
      if (
        wkpGeometry.coordinates.length === 0 ||
        !Array.isArray(wkpGeometry.coordinates[0]) ||
        !Array.isArray(wkpGeometry.coordinates[0][0])
      ) {
        errorMessages.push(
          `Geometry ${id}: invalid encoded polygon coordinates.`,
        );
        return false;
      }
      geometry = wkpGeometry;
    } else if (wkpGeometry.type === "MultiPolygon") {
      if (
        wkpGeometry.coordinates.length === 0 ||
        !Array.isArray(wkpGeometry.coordinates[0]) ||
        !Array.isArray(wkpGeometry.coordinates[0][0]) ||
        !Array.isArray(wkpGeometry.coordinates[0][0][0])
      ) {
        errorMessages.push(
          `Geometry ${id}: invalid encoded multipolygon coordinates.`,
        );
        return false;
      }
      geometry = wkpGeometry;
    } else {
      errorMessages.push(
        `Geometry ${id}: encoded geometry is not a polygon or multipolygon.`,
      );
      return false;
    }
  }
  if (!geometry) {
    errorMessages.push(
      `Geometry ${id} is a polygon but is missing WKT/WKP. Specify either WKT/WKP.`,
    );
    return false;
  }
  data.type = InputLayerType.Polygon;
  data.polygonData = geometry;
  data.polygonProperties = {
    lineWidth: getNumberFromValue(rowValues.polygonLineWidth),
    lineColor: lineColor.hexColor,
    lineColorValue: lineColor.numericValue,
    fillColor: fillColor.hexColor,
    fillColorValue: fillColor.numericValue,
    elevation: getNumberFromValue(rowValues.polygonExtrudeElevation),
  };
  return true;
};
