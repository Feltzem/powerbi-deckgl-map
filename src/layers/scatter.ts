import { ScatterplotLayer } from "@deck.gl/layers";
import { ColorRoleStatsStore, OurData } from "../dataTypes";
import { decodeHex, withOpacity } from "../col";
import {
  GradientBinningMethod,
  getNumericColorBinsSignature,
  NumericColorBinsCache,
} from "../gradientClassification";
import { resolveGradientPresetColors } from "../gradientPresets";
import { HighlightingCardSettings, ScatterCardSettings } from "../settings";
import { LAYER_IDS } from "../layerState";
import {
  createLayerColorAccessor,
  getLayerColorUpdateTriggers,
} from "./col";

export default function getScatterLayer(
  data: OurData[],
  settings: ScatterCardSettings,
  highlighting: HighlightingCardSettings,
  selectedIds: Set<string>,
  selectedSignature: string,
  colorRoles: ColorRoleStatsStore,
  classificationCache: NumericColorBinsCache,
  dataVersion: string,
  onClick: (info: any, event: any) => void,
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
  };
  const lineGradientSettings = {
    method: settings.lineGradient.binningMethod.value
      .value as GradientBinningMethod,
    classCount: settings.lineGradient.classCount.value,
    definedInterval: settings.lineGradient.definedInterval.value,
  };
  const fillColor = createLayerColorAccessor<OurData>({
    items: data,
    colorStats: colorRoles.scatterFillColor,
    classificationCache,
    cacheKey: `${dataVersion}:scatter-fill`,
    getColorValue: (d) => d.scatterProperties?.fillColor,
    getNumericColorValue: (d) => d.scatterProperties?.fillColorValue,
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

  return new ScatterplotLayer<OurData>({
    id: LAYER_IDS.scatter,
    data: data,
    pickable: true,
    stroked: settings.stroked.value,
    filled: settings.filled.value,
    getPosition: (d) => [d.scatterData!.lon, d.scatterData!.lat, 0.1],
    getLineWidth: (d) => {
      const w = d.scatterProperties?.lineWidth;
      if (typeof w === "number" && isFinite(w) && w > 0) {
        return w;
      }
      return settings.line.width.defaultLineWidth.value;
    },
    getRadius: (d) => {
      const r = d.scatterData?.radius;
      if (r && typeof r === "number" && isFinite(r) && r > 0) {
        return r;
      }
      return settings.defaultRadius.value;
    },
    getFillColor: fillColor.accessor,
    getLineColor: lineColor.accessor,
    radiusMinPixels: settings.radiusMinPixels.value,
    radiusMaxPixels: settings.radiusMaxPixels.value,
    billboard: settings.billboard.billboard.value,
    lineWidthMinPixels: settings.line.width.lineWidthMinPixels.value,
    lineWidthMaxPixels: settings.line.width.lineWidthMaxPixels.value,
    autoHighlight: highlighting.autoHighlight.value,
    highlightColor: autoHighlightColor,
    onClick: (info, event) => onClick(info, event),
    updateTriggers: {
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
          getNumericColorBinsSignature(fillColor.bins),
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
          getNumericColorBinsSignature(lineColor.bins),
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
