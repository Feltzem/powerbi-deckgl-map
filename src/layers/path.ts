import { GeoJsonLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { ColorRoleStatsStore, PathFeature } from "../dataTypes";
import { withOpacity, decodeHex } from "../col";
import {
  GradientBinningMethod,
  getNumericColorBinsSignature,
  NumericColorBinsCache,
} from "../gradientClassification";
import { resolveGradientPresetColors } from "../gradientPresets";
import { getCategoricalPaletteColor } from "../categoricalPalettes";
import { HighlightingCardSettings, PathCardSettings } from "../settings";
import { LAYER_IDS } from "../layerState";
import {
  createLayerColorAccessor,
  getLayerColorUpdateTriggers,
} from "./col";

export default function getPathLayer(
  data: PathFeature[],
  settings: PathCardSettings,
  highlighting: HighlightingCardSettings,
  selectedIds: Set<string>,
  selectedSignature: string,
  colorRoles: ColorRoleStatsStore,
  classificationCache: NumericColorBinsCache,
  dataVersion: string,
  onClick: (info: PickingInfo, event: unknown) => void,
) {
  const defaultLineColor = withOpacity(
    decodeHex(settings.line.color.defaultLineColor.value.value, [0, 0, 0, 100]),
    settings.line.color.defaultLineOpacity.value,
  );
  const fadeFactor = Math.max(
    0,
    Math.min(1, highlighting.unselectedFadeOpacity.value / 100),
  );
  const shouldFadeUnselected =
    highlighting.highlightOnClick.value && selectedIds.size > 0;
  const autoHighlightColor = withOpacity(
    decodeHex(highlighting.autoHighlightColor.value.value, [255, 153, 0, 255]),
    highlighting.autoHighlightOpacity.value,
  );
  const gradientSettings = {
    method: settings.gradient.binningMethod.value
      .value as GradientBinningMethod,
    classCount: settings.gradient.classCount.value,
    definedInterval: settings.gradient.definedInterval.value,
    manualBreaks: settings.gradient.manualBreaks.value,
    manualColors: settings.gradient.manualColors.value,
  };
  const lineColor = createLayerColorAccessor<PathFeature>({
    items: data,
    colorStats: colorRoles.pathColor,
    classificationCache,
    cacheKey: `${dataVersion}:path`,
    getColorValue: (d) => d.properties?.lineColor,
    getNumericColorValue: (d) => d.properties?.lineColorValue,
    getCategoricalColorValue: (d) => d.properties?.lineColorCategory,
    getCategoricalColor: (category) =>
      getCategoricalPaletteColor(
        category,
        settings.categoricalPalette.palette.value.value as string,
        settings.line.color.defaultLineOpacity.value,
      ),
    getId: (d) => String(d.id),
    defaultColor: defaultLineColor,
    getGradient: () =>
      resolveGradientPresetColors(
        settings.gradient.preset.value.value as string,
        settings.line.color.defaultLineOpacity.value,
      ),
    gradientSettings,
    shouldFade: shouldFadeUnselected,
    fadeFactor,
    selectedIds,
  });

  const hasZ = data.some((feature) => feature.hasZ);

  return new GeoJsonLayer({
    id: LAYER_IDS.path,
    data,
    pickable: true,
    // 3D WKP paths decode to [x, y, z]; tell deck.gl to read the Z so the
    // line floats at its baked elevation instead of being truncated to ground.
    positionFormat: hasZ ? "XYZ" : "XY",
    getLineWidth: (d) => {
      const w = d.properties?.lineWidth;
      if (typeof w === "number" && isFinite(w) && w > 0) {
        return w;
      }
      return settings.line.width.defaultLineWidth.value;
    },
    getLineColor: lineColor.accessor,
    lineWidthMinPixels: settings.line.width.lineWidthMinPixels.value,
    lineWidthMaxPixels: settings.line.width.lineWidthMaxPixels.value,
    lineCapRounded: settings.path.lineCapRounded.value,
    lineJointRounded: settings.path.lineJointRounded.value,
    lineMiterLimit: settings.path.lineMiterLimit.value,
    lineBillboard: settings.billboard.billboard.value,
    autoHighlight: highlighting.autoHighlight.value,
    highlightColor: autoHighlightColor,
    onClick: (info, event) => onClick(info, event),
    updateTriggers: {
      getLineWidth: [settings.line.width.defaultLineWidth.value],
      getLineColor: getLayerColorUpdateTriggers(
        [
          settings.line.color.defaultLineColor.value.value,
          settings.line.color.defaultLineOpacity.value,
        ],
        [
          settings.gradient.preset.value.value,
          settings.gradient.binningMethod.value.value,
          settings.gradient.classCount.value,
          settings.gradient.definedInterval.value,
          settings.gradient.manualBreaks.value,
          settings.gradient.manualColors.value,
          getNumericColorBinsSignature(lineColor.bins),
        ],
        [
          settings.categoricalPalette.palette.value.value,
          lineColor.categoricalSignature,
        ],
        lineColor,
        highlighting.highlightOnClick.value,
        highlighting.unselectedFadeOpacity.value,
        selectedSignature,
      ),
      getLineCapRounded: [settings.path.lineCapRounded.value],
      getLineJointRounded: [settings.path.lineJointRounded.value],
      getLineMiterLimit: [settings.path.lineMiterLimit.value],
      getLineBillboard: [settings.billboard.billboard.value],
      highlightColor: [
        highlighting.autoHighlightColor.value.value,
        highlighting.autoHighlightOpacity.value,
      ],
    },
  });
}
