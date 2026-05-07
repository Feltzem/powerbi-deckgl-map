import { InputLayerType, LineData, OurData, RowValues } from "../dataTypes";
import { getNumberFromValue, parseColorInput } from "../powerbiUtils";

const parseLineArcGeometry = (
  isProvided: RowValues,
  rowValues: RowValues,
  errorMessages: string[],
): [boolean, LineData | null] => {
  if (
    !isProvided.point1Latitude ||
    !isProvided.point1Longitude ||
    !isProvided.point2Latitude ||
    !isProvided.point2Longitude ||
    rowValues.point1Latitude === null ||
    rowValues.point1Longitude === null ||
    rowValues.point2Latitude === null ||
    rowValues.point2Longitude === null
  ) {
    errorMessages.push(
      `Geometry ${rowValues.geometryId}: invalid line/arc coordinates (need point1 and point2 lat and lon)`,
    );
    return [false, null];
  }
  const lat1 = parseFloat(rowValues.point1Latitude.toString()); // why not user number
  const lon1 = parseFloat(rowValues.point1Longitude.toString());
  const lat2 = parseFloat(rowValues.point2Latitude.toString());
  const lon2 = parseFloat(rowValues.point2Longitude.toString());
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) {
    errorMessages.push(
      `Geometry ${rowValues.geometryId}: invalid line/arc coordinates (one or more point coordinates parse to null)`,
    );
    return [false, null];
  }
  const lineData: LineData = {
    point1: { lat: lat1, lon: lon1 },
    point2: { lat: lat2, lon: lon2 },
  };
  return [true, lineData];
};

export const parseLine = (
  isProvided: RowValues,
  rowValues: RowValues,
  errorMessages: string[],
  data: OurData,
): boolean => {
  const [ok, geometryParsed] = parseLineArcGeometry(
    isProvided,
    rowValues,
    errorMessages,
  );
  if (!ok || !geometryParsed) {
    return false;
  }
  const lineColor = parseColorInput(rowValues.lineLineColor);
  data.type = InputLayerType.Line;
  data.lineData = geometryParsed;
  data.lineProperties = {
    lineWidth: getNumberFromValue(rowValues.lineLineWidth),
    lineColor: lineColor.rgbaColor,
    lineColorValue: lineColor.numericValue,
  };
  return true;
};

export const parseArc = (
  isProvided: RowValues,
  rowValues: RowValues,
  errorMessages: string[],
  data: OurData,
): boolean => {
  const [ok, geometryParsed] = parseLineArcGeometry(
    isProvided,
    rowValues,
    errorMessages,
  );
  if (!ok || !geometryParsed) {
    return false;
  }
  const sourceColor = parseColorInput(rowValues.arcSourceColor);
  const targetColor = parseColorInput(rowValues.arcTargetColor);
  data.type = InputLayerType.Arc;
  data.arcData = geometryParsed;
  data.arcProperties = {
    lineWidth: getNumberFromValue(rowValues.arcLineWidth),
    sourceColor: sourceColor.rgbaColor,
    sourceColorValue: sourceColor.numericValue,
    targetColor: targetColor.rgbaColor,
    targetColorValue: targetColor.numericValue,
  };
  return true;
};
