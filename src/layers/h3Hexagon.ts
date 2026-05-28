import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { latLngToCell } from "h3-js";
import type { Color, PickingInfo } from "@deck.gl/core";
import { RGBAColor, withOpacity } from "../col";
import { OurData } from "../dataTypes";
import {
  GradientBinningMethod,
  getBinIndex,
  getCachedNumericColorBins,
  getGradientClassColors,
  getGradientColorForValueFromClasses,
  NumericColorBins,
  NumericColorBinsCache,
} from "../gradientClassification";
import { resolveGradientPresetColors } from "../gradientPresets";
import { H3HexagonCardSettings } from "../settings";

export const H3_HEXAGON_LAYER_ID = "h3-hexagon-layer-base";
export const DEFAULT_H3_RESOLUTION = 7;
export const H3_HEXAGON_OUTLINE_COLOR: RGBAColor = [55, 65, 75, 220];

export interface H3HexagonCell {
  hexagon: string;
  count: number;
}

const joinCountFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

const clampNumber = (
  value: number,
  fallback: number,
  minValue: number,
  maxValue: number,
): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(minValue, Math.min(maxValue, value));
};

export const clampH3Resolution = (value: number): number =>
  Math.round(clampNumber(value, DEFAULT_H3_RESOLUTION, 0, 15));

const isValidPoint = (dataPoint: OurData): boolean => {
  const scatterData = dataPoint.scatterData;
  return !!(
    scatterData &&
    Number.isFinite(scatterData.lat) &&
    scatterData.lat >= -90 &&
    scatterData.lat <= 90 &&
    Number.isFinite(scatterData.lon) &&
    scatterData.lon >= -180 &&
    scatterData.lon <= 180
  );
};

export const aggregateScatterToH3Cells = (
  data: OurData[],
  resolution: number,
): H3HexagonCell[] => {
  const resolvedResolution = clampH3Resolution(resolution);
  const cellsByHexagon = new Map<string, H3HexagonCell>();

  for (const dataPoint of data) {
    if (!isValidPoint(dataPoint)) {
      continue;
    }

    const { lat, lon } = dataPoint.scatterData!;
    const hexagon = latLngToCell(lat, lon, resolvedResolution);
    const existing = cellsByHexagon.get(hexagon);
    if (existing) {
      existing.count += 1;
    } else {
      cellsByHexagon.set(hexagon, { hexagon, count: 1 });
    }
  }

  return Array.from(cellsByHexagon.values()).filter((cell) => cell.count > 0);
};

export const getH3CountOpacity = (
  count: number,
  bins: NumericColorBins | null,
  lowOpacity: number,
  highOpacity: number,
): number => {
  const low = clampNumber(lowOpacity, 70, 0, 255);
  const high = clampNumber(highOpacity, 210, 0, 255);

  if (!bins || bins.classCount <= 1) {
    return Math.round(high);
  }

  const classIndex = getBinIndex(count, bins);
  const t = classIndex / Math.max(1, bins.classCount - 1);
  return Math.round(low + (high - low) * t);
};

export const getH3CountColor = (
  count: number,
  bins: NumericColorBins | null,
  classColors: RGBAColor[],
  lowOpacity: number,
  highOpacity: number,
  fallbackColor: RGBAColor,
): RGBAColor => {
  if (
    bins &&
    bins.classCount > 0 &&
    bins.minValue !== null &&
    bins.maxValue !== null &&
    classColors.length > 0
  ) {
    return withOpacity(
      getGradientColorForValueFromClasses(count, bins, classColors),
      getH3CountOpacity(count, bins, lowOpacity, highOpacity),
    );
  }

  return withOpacity(fallbackColor, highOpacity);
};

export const getH3OutlineColor = (
  count: number,
  bins: NumericColorBins | null,
  lowOpacity: number,
  highOpacity: number,
): RGBAColor =>
  withOpacity(
    H3_HEXAGON_OUTLINE_COLOR,
    getH3CountOpacity(count, bins, lowOpacity, highOpacity),
  );

const isH3HexagonLayerId = (layerId: string | null | undefined): boolean =>
  !!layerId && layerId.startsWith(H3_HEXAGON_LAYER_ID);

const getH3TooltipCount = (object: unknown): number | null => {
  if (!object || typeof object !== "object") {
    return null;
  }

  const count = (object as Partial<H3HexagonCell>).count;
  return typeof count === "number" && Number.isFinite(count) && count >= 0
    ? count
    : null;
};

export const getH3HexagonTooltipHtml = (
  hoverInfo: Pick<PickingInfo, "layer" | "object">,
): string | null => {
  if (!isH3HexagonLayerId(hoverInfo.layer?.id)) {
    return null;
  }

  const count = getH3TooltipCount(hoverInfo.object);
  if (count === null) {
    return null;
  }

  return `<div class="deckgl-h3-tooltip"><strong>Join count</strong><br>${joinCountFormatter.format(count)}</div>`;
};

const getGradientSettings = (
  settings: H3HexagonCardSettings["fillGradient"],
) => ({
  method: settings.binningMethod.value.value as GradientBinningMethod,
  classCount: settings.classCount.value,
  definedInterval: settings.definedInterval.value,
});

export const getH3HexagonCountBins = (
  cells: H3HexagonCell[],
  settings: H3HexagonCardSettings["fillGradient"],
  classificationCache: NumericColorBinsCache,
  cacheKey: string,
): NumericColorBins =>
  getCachedNumericColorBins(
    classificationCache,
    cacheKey,
    cells,
    (cell) => cell.count,
    getGradientSettings(settings),
  );

export default function getH3HexagonLayer(
  data: OurData[],
  settings: H3HexagonCardSettings,
  classificationCache: NumericColorBinsCache,
  dataVersion: string,
) {
  const resolution = clampH3Resolution(settings.resolution.value);
  const cells = aggregateScatterToH3Cells(data, resolution);
  const fillBins = getH3HexagonCountBins(
    cells,
    settings.fillGradient,
    classificationCache,
    `${dataVersion}:h3-fill:${resolution}`,
  );
  const fillClassColors = getGradientClassColors(
    fillBins,
    resolveGradientPresetColors(
      settings.fillGradient.preset.value.value as string,
      255,
    ),
  );
  const fallbackFillColor = resolveGradientPresetColors(
    settings.fillGradient.preset.value.value as string,
    settings.highFillOpacity.value,
  ).highColor;

  return new H3HexagonLayer<H3HexagonCell>({
    id: H3_HEXAGON_LAYER_ID,
    data: cells,
    pickable: true,
    filled: true,
    stroked: true,
    extruded: false,
    coverage: 1,
    getHexagon: (cell) => cell.hexagon,
    getFillColor: (cell): Color =>
      getH3CountColor(
        cell.count,
        fillBins,
        fillClassColors,
        settings.lowFillOpacity.value,
        settings.highFillOpacity.value,
        fallbackFillColor,
      ),
    getLineColor: (cell): Color =>
      getH3OutlineColor(
        cell.count,
        fillBins,
        settings.lowFillOpacity.value,
        settings.highFillOpacity.value,
      ),
    getLineWidth: settings.lineWidth.defaultLineWidth.value,
    lineWidthMinPixels: settings.lineWidth.lineWidthMinPixels.value,
    lineWidthMaxPixels: settings.lineWidth.lineWidthMaxPixels.value,
    updateTriggers: {
      getHexagon: [resolution],
      getFillColor: [
        settings.fillGradient.preset.value.value,
        settings.fillGradient.binningMethod.value.value,
        settings.fillGradient.classCount.value,
        settings.fillGradient.definedInterval.value,
        settings.lowFillOpacity.value,
        settings.highFillOpacity.value,
      ],
      getLineColor: [
        H3_HEXAGON_OUTLINE_COLOR.join(","),
        settings.lowFillOpacity.value,
        settings.highFillOpacity.value,
      ],
      getLineWidth: [settings.lineWidth.defaultLineWidth.value],
    },
  });
}
