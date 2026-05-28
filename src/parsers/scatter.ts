import {
  InputLayerType,
  OurData,
  RowValueAvailability,
  RowValues,
} from "../dataTypes";
import {
  getNumberFromValue,
  getStrictNumberFromValue,
  parseColorInput,
} from "../powerbiUtils";

const getHeatmapWeight = (
  isProvided: RowValueAvailability,
  rowValues: RowValues,
): number | null => {
  if (!isProvided.heatmapWeight) {
    return null;
  }

  const value = getStrictNumberFromValue(rowValues.heatmapWeight);
  return typeof value === "number" && isFinite(value) && value > 0 ? value : 0;
};

export const parseScatter = (
  isProvided: RowValueAvailability,
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
  const lat = parseFloat(rowValues.point1Latitude.toString());
  const lon = parseFloat(rowValues.point1Longitude.toString());
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    errorMessages.push(
      `Geometry ${rowValues.geometryId}: one or more point coordinates are not finite numbers`,
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
    heatmapWeight: getHeatmapWeight(isProvided, rowValues),
  };
  data.scatterProperties = {
    lineWidth: getNumberFromValue(rowValues.scatterLineWidth),
    lineColor: lineColor.rgbaColor,
    lineColorValue: lineColor.numericValue,
    lineColorCategory: lineColor.categoricalValue,
    fillColor: fillColor.rgbaColor,
    fillColorValue: fillColor.numericValue,
    fillColorCategory: fillColor.categoricalValue,
  };
  return true;
};
