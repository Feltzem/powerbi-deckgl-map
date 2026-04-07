import { InputLayerType, OurData, RowValues } from "../dataTypes";
import { getNumberFromValue, parseColorInput } from "../powerbiUtils";

export const parseScatter = (
  isProvided: RowValues,
  rowValues: RowValues,
  errorMessages: string[],
  data: OurData,
): boolean => {
  if (
    !isProvided.point1Latitude ||
    !isProvided.point1Longitude ||
    rowValues.point1Latitude === null ||
    rowValues.point1Longitude === null
  ) {
    errorMessages.push(
      `Geometry ${rowValues.geometryId}: invalid point coordinates`,
    );
    return false;
  }
  const lat = parseFloat(rowValues.point1Latitude.toString()); // why not user number
  const lon = parseFloat(rowValues.point1Longitude.toString());
  if (lat === null || lon === null) {
    errorMessages.push(
      `Geometry ${rowValues.geometryId}: one or more point coordinates parse to null`,
    );
    return false;
  }
  const lineColor = parseColorInput(rowValues.scatterLineColor);
  const fillColor = parseColorInput(rowValues.scatterFillColor);
  data.type = InputLayerType.Scatter;
  data.scatterData = {
    lat: lat,
    lon: lon,
    radius: getNumberFromValue(rowValues.scatterRadius),
  };
  data.scatterProperties = {
    lineWidth: getNumberFromValue(rowValues.scatterLineWidth),
    lineColor: lineColor.hexColor,
    lineColorValue: lineColor.numericValue,
    fillColor: fillColor.hexColor,
    fillColorValue: fillColor.numericValue,
  };
  return true;
};
