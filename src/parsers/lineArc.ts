import {
  InputLayerType,
  LineData,
  OurData,
  RowValueAvailability,
  RowValues,
} from "../dataTypes";
import { getNumberFromValue, parseColorInput } from "../powerbiUtils";

const parseLineArcGeometry = (
  isProvided: RowValueAvailability,
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
  const lat1 = parseFloat(rowValues.point1Latitude.toString());
  const lon1 = parseFloat(rowValues.point1Longitude.toString());
  const lat2 = parseFloat(rowValues.point2Latitude.toString());
  const lon2 = parseFloat(rowValues.point2Longitude.toString());
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    errorMessages.push(
      `Geometry ${rowValues.geometryId}: invalid line/arc coordinates (one or more point coordinates are not finite numbers)`,
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
  isProvided: RowValueAvailability,
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
    lineColorCategory: lineColor.categoricalValue,
  };
  return true;
};

export const parseArc = (
  isProvided: RowValueAvailability,
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
    sourceColorCategory: sourceColor.categoricalValue,
    targetColor: targetColor.rgbaColor,
    targetColorValue: targetColor.numericValue,
    targetColorCategory: targetColor.categoricalValue,
  };
  return true;
};
