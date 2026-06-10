import { ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { ColorRoleStatsStore, OurData } from "../dataTypes";
import { decodeHex, withOpacity } from "../col";
import {
  GradientBinningMethod,
  getNumericColorBinsSignature,
  NumericColorBinsCache,
} from "../gradientClassification";
import { resolveGradientPresetColors } from "../gradientPresets";
import { getCategoricalPaletteColor } from "../categoricalPalettes";
import { HighlightingCardSettings, ScatterCardSettings } from "../settings";
import { LAYER_IDS } from "../layerState";
import { getScatterSymbolType } from "../scatterSymbols";
import {
  createLayerColorAccessor,
  getLayerColorUpdateTriggers,
} from "./col";
import ScatterSymbolLayer from "./scatterSymbolLayer";

export default function getScatterLayer(
  data: OurData[],
  settings: ScatterCardSettings,
  highlighting: HighlightingCardSettings,
  selectedIds: Set<string>,
  selectedSignature: string,
  colorRoles: ColorRoleStatsStore,
  classificationCache: NumericColorBinsCache,
  dataVersion: string,
  onClick: (info: PickingInfo, event: unknown) => void,
) {
  const defaultFillColor = withOpacity(
    decodeHex(settings.fill.defaultFillColor.value.value, [0, 0, 0, 100]),
    settings.fill.defaultFillOpacity.value,
  );
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
  const fillGradientSettings = {
    method: settings.fillGradient.binningMethod.value
      .value as GradientBinningMethod,
    classCount: settings.fillGradient.classCount.value,
    definedInterval: settings.fillGradient.definedInterval.value,
    manualBreaks: settings.fillGradient.manualBreaks.value,
    manualColors: settings.fillGradient.manualColors.value,
  };
  const lineGradientSettings = {
    method: settings.lineGradient.binningMethod.value
      .value as GradientBinningMethod,
    classCount: settings.lineGradient.classCount.value,
    definedInterval: settings.lineGradient.definedInterval.value,
    manualBreaks: settings.lineGradient.manualBreaks.value,
    manualColors: settings.lineGradient.manualColors.value,
  };
  const fillColor = createLayerColorAccessor<OurData>({
    items: data,
    colorStats: colorRoles.scatterFillColor,
    classificationCache,
    cacheKey: `${dataVersion}:scatter-fill`,
    getColorValue: (d) => d.scatterProperties?.fillColor,
    getNumericColorValue: (d) => d.scatterProperties?.fillColorValue,
    getCategoricalColorValue: (d) => d.scatterProperties?.fillColorCategory,
    getCategoricalColor: (category) =>
      getCategoricalPaletteColor(
        category,
        settings.fillCategoricalPalette.palette.value.value as string,
        settings.fill.defaultFillOpacity.value,
      ),
    getId: (d) => String(d.id),
    defaultColor: defaultFillColor,
    getGradient: () =>
      resolveGradientPresetColors(
        settings.fillGradient.preset.value.value as string,
        settings.fill.defaultFillOpacity.value,
      ),
    gradientSettings: fillGradientSettings,
    shouldFade: shouldFadeUnselected,
    fadeFactor,
    selectedIds,
  });
  const lineColor = createLayerColorAccessor<OurData>({
    items: data,
    colorStats: colorRoles.scatterLineColor,
    classificationCache,
    cacheKey: `${dataVersion}:scatter-line`,
    getColorValue: (d) => d.scatterProperties?.lineColor,
    getNumericColorValue: (d) => d.scatterProperties?.lineColorValue,
    getCategoricalColorValue: (d) => d.scatterProperties?.lineColorCategory,
    getCategoricalColor: (category) =>
      getCategoricalPaletteColor(
        category,
        settings.lineCategoricalPalette.palette.value.value as string,
        settings.line.color.defaultLineOpacity.value,
      ),
    getId: (d) => String(d.id),
    defaultColor: defaultLineColor,
    getGradient: () =>
      resolveGradientPresetColors(
        settings.lineGradient.preset.value.value as string,
        settings.line.color.defaultLineOpacity.value,
      ),
    gradientSettings: lineGradientSettings,
    shouldFade: shouldFadeUnselected,
    fadeFactor,
    selectedIds,
  });
  const symbolType = getScatterSymbolType(settings.symbolType.value);
  const getLineWidth = (d: OurData) => {
    const w = d.scatterProperties?.lineWidth;
    if (typeof w === "number" && isFinite(w) && w > 0) {
      return w;
    }
    return settings.line.width.defaultLineWidth.value;
  };
  const getRadius = (d: OurData) => {
    const r = d.scatterData?.radius;
    if (r && typeof r === "number" && isFinite(r) && r > 0) {
      return r;
    }
    return settings.defaultRadius.value;
  };
  const updateTriggers = {
    getLineWidth: [settings.line.width.defaultLineWidth.value],
    getRadius: [settings.defaultRadius.value],
    getFillColor: getLayerColorUpdateTriggers(
      [
        settings.fill.defaultFillColor.value.value,
        settings.fill.defaultFillOpacity.value,
      ],
      [
        settings.fillGradient.preset.value.value,
        settings.fillGradient.binningMethod.value.value,
        settings.fillGradient.classCount.value,
        settings.fillGradient.definedInterval.value,
        settings.fillGradient.manualBreaks.value,
        settings.fillGradient.manualColors.value,
        getNumericColorBinsSignature(fillColor.bins),
      ],
      [
        settings.fillCategoricalPalette.palette.value.value,
        fillColor.categoricalSignature,
      ],
      fillColor,
      highlighting.highlightOnClick.value,
      highlighting.unselectedFadeOpacity.value,
      selectedSignature,
    ),
    getLineColor: getLayerColorUpdateTriggers(
      [
        settings.line.color.defaultLineColor.value.value,
        settings.line.color.defaultLineOpacity.value,
      ],
      [
        settings.lineGradient.preset.value.value,
        settings.lineGradient.binningMethod.value.value,
        settings.lineGradient.classCount.value,
        settings.lineGradient.definedInterval.value,
        settings.lineGradient.manualBreaks.value,
        settings.lineGradient.manualColors.value,
        getNumericColorBinsSignature(lineColor.bins),
      ],
      [
        settings.lineCategoricalPalette.palette.value.value,
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
  };
  const layerProps = {
    id: LAYER_IDS.scatter,
    data: data,
    pickable: true,
    stroked: settings.stroked.value,
    filled: settings.filled.value,
    getPosition: (d: OurData): [number, number, number] => [
      d.scatterData!.lon,
      d.scatterData!.lat,
      0.1,
    ],
    getLineWidth,
    getRadius,
    getFillColor: fillColor.accessor,
    getLineColor: lineColor.accessor,
    radiusMinPixels: settings.radiusMinPixels.value,
    radiusMaxPixels: settings.radiusMaxPixels.value,
    billboard: settings.billboard.billboard.value,
    lineWidthMinPixels: settings.line.width.lineWidthMinPixels.value,
    lineWidthMaxPixels: settings.line.width.lineWidthMaxPixels.value,
    autoHighlight: highlighting.autoHighlight.value,
    highlightColor: autoHighlightColor,
    onClick: (info: PickingInfo, event: unknown) => onClick(info, event),
    updateTriggers,
  };

  if (symbolType !== "circle") {
    return new ScatterSymbolLayer<OurData>({
      ...layerProps,
      symbolType,
    });
  }

  return new ScatterplotLayer<OurData>({
    ...layerProps,
  });
}
