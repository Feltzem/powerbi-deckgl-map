import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { Color } from "@deck.gl/core";
import { interpolateGradientColor } from "../col";
import { OurData } from "../dataTypes";
import { resolveGradientPresetColors } from "../gradientPresets";
import { HeatmapCardSettings } from "../settings";

const HEATMAP_LAYER_ID = "scatter-heatmap-layer-base";
const HEATMAP_COLOR_STEPS = 6;

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

export const getHeatmapColorRange = (
  presetKey: string | null | undefined,
  opacity: number,
  steps = HEATMAP_COLOR_STEPS,
): Color[] => {
  const resolvedOpacity = clampNumber(opacity, 180, 0, 255);
  const gradient = resolveGradientPresetColors(presetKey, resolvedOpacity);
  const stepCount = Math.max(2, Math.floor(steps));

  return Array.from({ length: stepCount }, (_value, index) =>
    interpolateGradientColor(
      index / (stepCount - 1),
      0,
      1,
      gradient.lowColor,
      gradient.highColor,
      gradient.middleColor,
    ),
  );
};

export const getScatterHeatmapWeight = (dataPoint: OurData): number => {
  if (!dataPoint.scatterData) {
    return 0;
  }

  const weight = dataPoint.scatterData.heatmapWeight;
  if (weight === null) {
    return 1;
  }

  return typeof weight === "number" && Number.isFinite(weight) && weight > 0
    ? weight
    : 0;
};

export default function getHeatmapLayer(
  data: OurData[],
  settings: HeatmapCardSettings,
) {
  const opacity = clampNumber(settings.opacity.value, 180, 0, 255);
  const threshold = clampNumber(settings.threshold.value, 5, 0, 100) / 100;

  return new HeatmapLayer<OurData>({
    id: HEATMAP_LAYER_ID,
    data,
    pickable: false,
    getPosition: (d) => [d.scatterData!.lon, d.scatterData!.lat],
    getWeight: getScatterHeatmapWeight,
    radiusPixels: clampNumber(settings.radiusPixels.value, 50, 1, 100),
    intensity: clampNumber(settings.intensity.value, 1, 0, 100),
    threshold,
    colorRange: getHeatmapColorRange(
      settings.colorPalette.value.value as string,
      opacity,
    ),
    aggregation: "SUM",
  });
}
