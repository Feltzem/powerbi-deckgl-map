import { ArcLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { ColorRoleStatsStore, OurData } from "../dataTypes";
import { withOpacity, decodeHex } from "../col";
import {
  GradientBinningMethod,
  getNumericColorBinsSignature,
  NumericColorBinsCache,
} from "../gradientClassification";
import { resolveGradientPresetColors } from "../gradientPresets";
import { getCategoricalPaletteColor } from "../categoricalPalettes";
import { ArcCardSettings, HighlightingCardSettings } from "../settings";
import { LAYER_IDS } from "../layerState";
import {
  createLayerColorAccessor,
  getLayerColorUpdateTriggers,
} from "./col";

export default function getArcLayer(
  data: OurData[],
  settings: ArcCardSettings,
  highlighting: HighlightingCardSettings,
  selectedIds: Set<string>,
  selectedSignature: string,
  colorRoles: ColorRoleStatsStore,
  classificationCache: NumericColorBinsCache,
  dataVersion: string,
  onClick: (info: PickingInfo, event: unknown) => void,
) {
  const defaultSourceColor = withOpacity(
    decodeHex(settings.defaultSourceColor.value.value, [0, 0, 0, 100]),
    settings.defaultSourceOpacity.value,
  );
  const defaultTargetColor = withOpacity(
    decodeHex(settings.defaultTargetColor.value.value, [0, 0, 0, 100]),
    settings.defaultTargetOpacity.value,
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
  const sourceGradientSettings = {
    method: settings.sourceGradient.binningMethod.value
      .value as GradientBinningMethod,
    classCount: settings.sourceGradient.classCount.value,
    definedInterval: settings.sourceGradient.definedInterval.value,
  };
  const targetGradientSettings = {
    method: settings.targetGradient.binningMethod.value
      .value as GradientBinningMethod,
    classCount: settings.targetGradient.classCount.value,
    definedInterval: settings.targetGradient.definedInterval.value,
  };
  const sourceColor = createLayerColorAccessor<OurData>({
    items: data,
    colorStats: colorRoles.arcSourceColor,
    classificationCache,
    cacheKey: `${dataVersion}:arc-source`,
    getColorValue: (d) => d.arcProperties?.sourceColor,
    getNumericColorValue: (d) => d.arcProperties?.sourceColorValue,
    getCategoricalColorValue: (d) => d.arcProperties?.sourceColorCategory,
    getCategoricalColor: (category) =>
      getCategoricalPaletteColor(
        category,
        settings.sourceCategoricalPalette.palette.value.value as string,
        settings.defaultSourceOpacity.value,
      ),
    getId: (d) => String(d.id),
    defaultColor: defaultSourceColor,
    getGradient: () =>
      resolveGradientPresetColors(
        settings.sourceGradient.preset.value.value as string,
        settings.defaultSourceOpacity.value,
      ),
    gradientSettings: sourceGradientSettings,
    shouldFade: shouldFadeUnselected,
    fadeFactor,
    selectedIds,
  });
  const targetColor = createLayerColorAccessor<OurData>({
    items: data,
    colorStats: colorRoles.arcTargetColor,
    classificationCache,
    cacheKey: `${dataVersion}:arc-target`,
    getColorValue: (d) => d.arcProperties?.targetColor,
    getNumericColorValue: (d) => d.arcProperties?.targetColorValue,
    getCategoricalColorValue: (d) => d.arcProperties?.targetColorCategory,
    getCategoricalColor: (category) =>
      getCategoricalPaletteColor(
        category,
        settings.targetCategoricalPalette.palette.value.value as string,
        settings.defaultTargetOpacity.value,
      ),
    getId: (d) => String(d.id),
    defaultColor: defaultTargetColor,
    getGradient: () =>
      resolveGradientPresetColors(
        settings.targetGradient.preset.value.value as string,
        settings.defaultTargetOpacity.value,
      ),
    gradientSettings: targetGradientSettings,
    shouldFade: shouldFadeUnselected,
    fadeFactor,
    selectedIds,
  });

  return new ArcLayer<OurData>({
    id: LAYER_IDS.arc,
    data: data,
    pickable: true,
    getSourcePosition: (d) => [d.arcData!.point1.lon, d.arcData!.point1.lat],
    getTargetPosition: (d) => [d.arcData!.point2.lon, d.arcData!.point2.lat],
    getWidth: (d) => {
      const w = d.arcProperties?.lineWidth;
      if (typeof w === "number" && isFinite(w) && w > 0) {
        return w;
      }
      return settings.strokeWidth.defaultLineWidth.value;
    },
    getSourceColor: sourceColor.accessor,
    getTargetColor: targetColor.accessor,
    widthMinPixels: settings.strokeWidth.lineWidthMinPixels.value,
    widthMaxPixels: settings.strokeWidth.lineWidthMaxPixels.value,
    autoHighlight: highlighting.autoHighlight.value,
    highlightColor: autoHighlightColor,
    onClick: (info, event) => onClick(info, event),
    updateTriggers: {
      getWidth: [settings.strokeWidth.defaultLineWidth.value],
      getSourceColor: getLayerColorUpdateTriggers(
        [
          settings.defaultSourceColor.value.value,
          settings.defaultSourceOpacity.value,
        ],
        [
          settings.sourceGradient.preset.value.value,
          settings.sourceGradient.binningMethod.value.value,
          settings.sourceGradient.classCount.value,
          settings.sourceGradient.definedInterval.value,
          getNumericColorBinsSignature(sourceColor.bins),
        ],
        [
          settings.sourceCategoricalPalette.palette.value.value,
          sourceColor.categoricalSignature,
        ],
        sourceColor,
        highlighting.highlightOnClick.value,
        highlighting.unselectedFadeOpacity.value,
        selectedSignature,
      ),
      getTargetColor: getLayerColorUpdateTriggers(
        [
          settings.defaultTargetColor.value.value,
          settings.defaultTargetOpacity.value,
        ],
        [
          settings.targetGradient.preset.value.value,
          settings.targetGradient.binningMethod.value.value,
          settings.targetGradient.classCount.value,
          settings.targetGradient.definedInterval.value,
          getNumericColorBinsSignature(targetColor.bins),
        ],
        [
          settings.targetCategoricalPalette.palette.value.value,
          targetColor.categoricalSignature,
        ],
        targetColor,
        highlighting.highlightOnClick.value,
        highlighting.unselectedFadeOpacity.value,
        selectedSignature,
      ),
      highlightColor: [
        highlighting.autoHighlightColor.value.value,
        highlighting.autoHighlightOpacity.value,
      ],
    },
  });
}
