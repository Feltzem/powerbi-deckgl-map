import { InputLayerType, OurData, RowValues } from "../dataTypes";
import { Geometry, LineString, MultiLineString } from "geojson";
import { getNumberFromValue, parseColorInput } from "../powerbiUtils";

export const parsePath = (
  wktGeometry: Geometry,
  wkpGeometry: Geometry,
  rowValues: RowValues,
  errorMessages: string[],
  data: OurData,
): boolean => {
  let geometry: LineString | MultiLineString | null = null;
  const pathColor = parseColorInput(rowValues.pathColor);
  const id = rowValues.geometryId;
  if (wktGeometry) {
    if (wktGeometry.type === "LineString") {
      geometry = wktGeometry;
    } else if (wktGeometry.type === "MultiLineString") {
      geometry = wktGeometry;
    } else {
      errorMessages.push(
        `Geometry ${id}: WKT geometry is not a line string or multi line string.`,
      );
      return false;
    }
  } else if (wkpGeometry) {
    if (wkpGeometry.type === "LineString") {
      geometry = wkpGeometry;
    } else if (wkpGeometry.type === "MultiLineString") {
      geometry = wkpGeometry;
    } else {
      errorMessages.push(`Geometry ${id}: invalid encoded line coordinates.`);
      return false;
    }
  }
  if (!geometry) {
    errorMessages.push(
      `Geometry ${id} is a line but is missing WKT/WKP. Specify either WKT/WKP.`,
    );
    return false;
  }

  data.type = InputLayerType.Path;
  data.pathData = geometry;
  data.pathProperties = {
    lineWidth: getNumberFromValue(rowValues.pathWidth),
    lineColor: pathColor.rgbaColor,
    lineColorValue: pathColor.numericValue,
    lineColorCategory: pathColor.categoricalValue,
  };
  return true;
};
