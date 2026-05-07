import { ArcLayer } from "@deck.gl/layers";
import { OurData } from "../dataTypes";
import { withOpacity, decodeHex } from "../col";
import {
  GradientBinningMethod,
  getCachedNumericColorBins,
  getNumericColorBinsSignature,
  NumericColorBinsCache,
} from "../gradientClassification";
import { resolveGradientPresetColors } from "../gradientPresets";
import { ArcCardSettings, HighlightingCardSettings } from "../settings";
import { getLayerColorWithGradient } from "./col";

export default function getArcLayer(
  data: OurData[],
  settings: ArcCardSettings,
  highlighting: HighlightingCardSettings,
  selectedIds: Set<string>,
  selectedSignature: string,
  classificationCache: NumericColorBinsCache,
  dataVersion: string,
  onClick: (info: any, event: any) => void,
) {
  const defaultSourceColor = withOpacity(
    decodeHex(settings.defaultSourceColor.value.value, [0, 0, 0, 100]),
    settings.defaultSourceOpacity.value,
  );
  const defaultTargetColor = withOpacity(
    decodeHex(settings.defaultTargetColor.value.value, [0, 0, 0, 100]),
    settings.defaultTargetOpacity.value,
  );
  const sourceGradient = resolveGradientPresetColors(
    settings.sourceGradient.preset.value.value as string,
    settings.defaultSourceOpacity.value,
  );
  const targetGradient = resolveGradientPresetColors(
    settings.targetGradient.preset.value.value as string,
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
  const sourceColorBins = getCachedNumericColorBins(
    classificationCache,
    `${dataVersion}:arc-source`,
    data,
    (d) => d.arcProperties?.sourceColorValue,
    {
      method: settings.sourceGradient.binningMethod.value
        .value as GradientBinningMethod,
      classCount: settings.sourceGradient.classCount.value,
      definedInterval: settings.sourceGradient.definedInterval.value,
    },
  );
  const targetColorBins = getCachedNumericColorBins(
    classificationCache,
    `${dataVersion}:arc-target`,
    data,
    (d) => d.arcProperties?.targetColorValue,
    {
      method: settings.targetGradient.binningMethod.value
        .value as GradientBinningMethod,
      classCount: settings.targetGradient.classCount.value,
      definedInterval: settings.targetGradient.definedInterval.value,
    },
  );
  return new ArcLayer<OurData>({
    id: `arc-layer-base`,
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
    getSourceColor: (d) =>
      getLayerColorWithGradient(
        d.arcProperties?.sourceColor,
        d.arcProperties?.sourceColorValue,
        defaultSourceColor,
        sourceGradient,
        sourceColorBins,
        shouldFadeUnselected,
        fadeFactor,
        selectedIds,
        String(d.id),
      ),
    getTargetColor: (d) =>
      getLayerColorWithGradient(
        d.arcProperties?.targetColor,
        d.arcProperties?.targetColorValue,
        defaultTargetColor,
        targetGradient,
        targetColorBins,
        shouldFadeUnselected,
        fadeFactor,
        selectedIds,
        String(d.id),
      ),
    widthMinPixels: settings.strokeWidth.lineWidthMinPixels.value,
    widthMaxPixels: settings.strokeWidth.lineWidthMaxPixels.value,
    autoHighlight: highlighting.autoHighlight.value,
    highlightColor: autoHighlightColor,
    onClick: (info, event) => onClick(info, event),
    updateTriggers: {
      getWidth: [settings.strokeWidth.defaultLineWidth.value],
      getSourceColor: [
        settings.defaultSourceColor.value.value,
        settings.defaultSourceOpacity.value,
        settings.sourceGradient.preset.value.value,
        settings.sourceGradient.binningMethod.value.value,
        settings.sourceGradient.classCount.value,
        settings.sourceGradient.definedInterval.value,
        getNumericColorBinsSignature(sourceColorBins),
        highlighting.highlightOnClick.value,
        highlighting.unselectedFadeOpacity.value,
        selectedSignature,
      ],
      getTargetColor: [
        settings.defaultTargetColor.value.value,
        settings.defaultTargetOpacity.value,
        settings.targetGradient.preset.value.value,
        settings.targetGradient.binningMethod.value.value,
        settings.targetGradient.classCount.value,
        settings.targetGradient.definedInterval.value,
        getNumericColorBinsSignature(targetColorBins),
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
