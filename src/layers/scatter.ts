import { ScatterplotLayer } from "@deck.gl/layers";
import { InputLayerType, OurData } from "../dataTypes";
import { decodeHex, withOpacity } from "../col";
import {
  GradientBinningMethod,
  getNumericColorBins,
  getNumericColorBinsSignature,
} from "../gradientClassification";
import { resolveGradientPresetColors } from "../gradientPresets";
import { HighlightingCardSettings, ScatterCardSettings } from "../settings";
import { getLayerColorWithGradient } from "./col";

export default function getScatterLayer(
  dataPoints: OurData[],
  settings: ScatterCardSettings,
  highlighting: HighlightingCardSettings,
  selectedIds: Set<string>,
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
  const fillGradient = resolveGradientPresetColors(
    settings.fillGradient.preset.value.value as string,
    settings.fill.defaultFillOpacity.value,
  );
  const lineGradient = resolveGradientPresetColors(
    settings.lineGradient.preset.value.value as string,
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
  const data = dataPoints.filter((x) => x.type === InputLayerType.Scatter);
  const fillColorBins = getNumericColorBins(
    data,
    (d) => d.scatterProperties?.fillColorValue,
    {
      method: settings.fillGradient.binningMethod.value
        .value as GradientBinningMethod,
      classCount: settings.fillGradient.classCount.value,
      definedInterval: settings.fillGradient.definedInterval.value,
    },
  );
  const lineColorBins = getNumericColorBins(
    data,
    (d) => d.scatterProperties?.lineColorValue,
    {
      method: settings.lineGradient.binningMethod.value
        .value as GradientBinningMethod,
      classCount: settings.lineGradient.classCount.value,
      definedInterval: settings.lineGradient.definedInterval.value,
    },
  );

  return new ScatterplotLayer<OurData>({
    id: `scatterplot-layer-base`,
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
    getFillColor: (d) =>
      getLayerColorWithGradient(
        d.scatterProperties?.fillColor,
        d.scatterProperties?.fillColorValue,
        defaultFillColor,
        fillGradient,
        fillColorBins,
        shouldFadeUnselected,
        fadeFactor,
        selectedIds,
        String(d.id),
      ),
    getLineColor: (d) =>
      getLayerColorWithGradient(
        d.scatterProperties?.lineColor,
        d.scatterProperties?.lineColorValue,
        defaultLineColor,
        lineGradient,
        lineColorBins,
        shouldFadeUnselected,
        fadeFactor,
        selectedIds,
        String(d.id),
      ),
    radiusMinPixels: settings.radiusMinPixels.value,
    radiusMaxPixels: settings.radiusMaxPixels.value,
    billboard: settings.billboard.billboard.value,
    lineWidthMinPixels: settings.line.width.lineWidthMinPixels.value,
    lineWidthMaxPixels: settings.line.width.lineWidthMaxPixels.value,
    autoHighlight: highlighting.autoHighlight.value,
    highlightColor: autoHighlightColor,
    onClick: (info, event) => onClick(info, event),
    updateTriggers: {
      getLineWidth: [settings.line.width.defaultLineWidth.value, selectedIds],
      getRadius: [settings.defaultRadius.value, selectedIds],
      getFillColor: [
        settings.fill.defaultFillColor.value.value,
        settings.fill.defaultFillOpacity.value,
        settings.fillGradient.preset.value.value,
        settings.fillGradient.binningMethod.value.value,
        settings.fillGradient.classCount.value,
        settings.fillGradient.definedInterval.value,
        getNumericColorBinsSignature(fillColorBins),
        highlighting.highlightOnClick.value,
        highlighting.unselectedFadeOpacity.value,
        selectedIds,
      ],
      getLineColor: [
        settings.line.color.defaultLineColor.value.value,
        settings.line.color.defaultLineOpacity.value,
        settings.lineGradient.preset.value.value,
        settings.lineGradient.binningMethod.value.value,
        settings.lineGradient.classCount.value,
        settings.lineGradient.definedInterval.value,
        getNumericColorBinsSignature(lineColorBins),
        highlighting.highlightOnClick.value,
        highlighting.unselectedFadeOpacity.value,
        selectedIds,
      ],
      highlightColor: [
        highlighting.autoHighlightColor.value.value,
        highlighting.autoHighlightOpacity.value,
      ],
    },
  });
}
