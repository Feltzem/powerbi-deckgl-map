import { LineLayer } from "@deck.gl/layers";
import { OurData } from "../dataTypes";
import { withOpacity, decodeHex } from "../col";
import {
  GradientBinningMethod,
  getCachedNumericColorBins,
  getNumericColorBinsSignature,
  NumericColorBinsCache,
} from "../gradientClassification";
import { resolveGradientPresetColors } from "../gradientPresets";
import { HighlightingCardSettings, LineCardSettings } from "../settings";
import { getLayerColorWithGradient } from "./col";

export default function getLineLayer(
  data: OurData[],
  settings: LineCardSettings,
  highlighting: HighlightingCardSettings,
  selectedIds: Set<string>,
  selectedSignature: string,
  classificationCache: NumericColorBinsCache,
  dataVersion: string,
  onClick: (info: any, event: any) => void,
) {
  const defaultLineColor = withOpacity(
    decodeHex(settings.line.color.defaultLineColor.value.value, [0, 0, 0, 100]),
    settings.line.color.defaultLineOpacity.value,
  );
  const gradient = resolveGradientPresetColors(
    settings.gradient.preset.value.value as string,
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
  const lineColorBins = getCachedNumericColorBins(
    classificationCache,
    `${dataVersion}:line`,
    data,
    (d) => d.lineProperties?.lineColorValue,
    {
      method: settings.gradient.binningMethod.value
        .value as GradientBinningMethod,
      classCount: settings.gradient.classCount.value,
      definedInterval: settings.gradient.definedInterval.value,
    },
  );

  return new LineLayer<OurData>({
    id: `line-layer-base`,
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
    getColor: (d) =>
      getLayerColorWithGradient(
        d.lineProperties?.lineColor,
        d.lineProperties?.lineColorValue,
        defaultLineColor,
        gradient,
        lineColorBins,
        shouldFadeUnselected,
        fadeFactor,
        selectedIds,
        String(d.id),
      ),
    widthMinPixels: settings.line.width.lineWidthMinPixels.value,
    widthMaxPixels: settings.line.width.lineWidthMaxPixels.value,
    autoHighlight: highlighting.autoHighlight.value,
    highlightColor: autoHighlightColor,
    onClick: (info, event) => onClick(info, event),
    updateTriggers: {
      getWidth: [settings.line.width.defaultLineWidth.value],
      getColor: [
        settings.line.color.defaultLineColor.value.value,
        settings.line.color.defaultLineOpacity.value,
        settings.gradient.preset.value.value,
        settings.gradient.binningMethod.value.value,
        settings.gradient.classCount.value,
        settings.gradient.definedInterval.value,
        getNumericColorBinsSignature(lineColorBins),
        highlighting.highlightOnClick.value,
        highlighting.unselectedFadeOpacity.value,
        selectedSignature,
      ],
      highlightColor: [
        highlighting.autoHighlightColor.value.value,
        highlighting.autoHighlightOpacity.value,
      ],
    },
  });
}
