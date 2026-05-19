import { LineLayer } from "@deck.gl/layers";
import { ColorRoleStatsStore, OurData } from "../dataTypes";
import { withOpacity, decodeHex } from "../col";
import {
  GradientBinningMethod,
  getNumericColorBinsSignature,
  NumericColorBinsCache,
} from "../gradientClassification";
import { resolveGradientPresetColors } from "../gradientPresets";
import { getCategoricalPaletteColor } from "../categoricalPalettes";
import { HighlightingCardSettings, LineCardSettings } from "../settings";
import { LAYER_IDS } from "../layerState";
import {
  createLayerColorAccessor,
  getLayerColorUpdateTriggers,
} from "./col";

export default function getLineLayer(
  data: OurData[],
  settings: LineCardSettings,
  highlighting: HighlightingCardSettings,
  selectedIds: Set<string>,
  selectedSignature: string,
  colorRoles: ColorRoleStatsStore,
  classificationCache: NumericColorBinsCache,
  dataVersion: string,
  onClick: (info: any, event: any) => void,
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
  };
  const lineColor = createLayerColorAccessor<OurData>({
    items: data,
    colorStats: colorRoles.lineLineColor,
    classificationCache,
    cacheKey: `${dataVersion}:line`,
    getColorValue: (d) => d.lineProperties?.lineColor,
    getNumericColorValue: (d) => d.lineProperties?.lineColorValue,
    getCategoricalColorValue: (d) => d.lineProperties?.lineColorCategory,
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

  return new LineLayer<OurData>({
    id: LAYER_IDS.line,
    data: data,
    pickable: true,
    getSourcePosition: (d) => [
      d.lineData!.point1.lon,
      d.lineData!.point1.lat,
      0.1,
    ],
    getTargetPosition: (d) => [
      d.lineData!.point2.lon,
      d.lineData!.point2.lat,
      0.1,
    ],
    getWidth: (d) => {
      const w = d.lineProperties?.lineWidth;
      if (typeof w === "number" && isFinite(w) && w > 0) {
        return w;
      }
      return settings.line.width.defaultLineWidth.value;
    },
    getColor: lineColor.accessor,
    widthMinPixels: settings.line.width.lineWidthMinPixels.value,
    widthMaxPixels: settings.line.width.lineWidthMaxPixels.value,
    autoHighlight: highlighting.autoHighlight.value,
    highlightColor: autoHighlightColor,
    onClick: (info, event) => onClick(info, event),
    updateTriggers: {
      getWidth: [settings.line.width.defaultLineWidth.value],
      getColor: getLayerColorUpdateTriggers(
        [
          settings.line.color.defaultLineColor.value.value,
          settings.line.color.defaultLineOpacity.value,
        ],
        [
          settings.gradient.preset.value.value,
          settings.gradient.binningMethod.value.value,
          settings.gradient.classCount.value,
          settings.gradient.definedInterval.value,
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
      highlightColor: [
        highlighting.autoHighlightColor.value.value,
        highlighting.autoHighlightOpacity.value,
      ],
    },
  });
}
