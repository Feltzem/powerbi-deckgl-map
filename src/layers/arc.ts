import { ArcLayer } from "@deck.gl/layers";
import { InputLayerType, OurData } from "../dataTypes";
import { withOpacity, decodeHex } from "../col";
import { ArcCardSettings, HighlightingCardSettings } from "../settings";
import { getLayerColorWithGradient, getNumericColorRange } from "./col";

export default function getArcLayer(
  dataPoints: OurData[],
  settings: ArcCardSettings,
  highlighting: HighlightingCardSettings,
  selectedIds: Set<string>,
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
  const sourceGradient = {
    lowColor: withOpacity(
      decodeHex(
        settings.sourceGradient.lowColor.value.value,
        [44, 123, 182, 255],
      ),
      settings.defaultSourceOpacity.value,
    ),
    middleColor: settings.sourceGradient.useMiddleColor.value
      ? withOpacity(
          decodeHex(
            settings.sourceGradient.middleColor.value.value,
            [255, 255, 191, 255],
          ),
          settings.defaultSourceOpacity.value,
        )
      : null,
    highColor: withOpacity(
      decodeHex(
        settings.sourceGradient.highColor.value.value,
        [215, 25, 28, 255],
      ),
      settings.defaultSourceOpacity.value,
    ),
  };
  const targetGradient = {
    lowColor: withOpacity(
      decodeHex(
        settings.targetGradient.lowColor.value.value,
        [44, 123, 182, 255],
      ),
      settings.defaultTargetOpacity.value,
    ),
    middleColor: settings.targetGradient.useMiddleColor.value
      ? withOpacity(
          decodeHex(
            settings.targetGradient.middleColor.value.value,
            [255, 255, 191, 255],
          ),
          settings.defaultTargetOpacity.value,
        )
      : null,
    highColor: withOpacity(
      decodeHex(
        settings.targetGradient.highColor.value.value,
        [215, 25, 28, 255],
      ),
      settings.defaultTargetOpacity.value,
    ),
  };
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
  const data = dataPoints.filter((x) => x.type === InputLayerType.Arc);
  const sourceColorRange = getNumericColorRange(
    data,
    (d) => d.arcProperties?.sourceColorValue,
  );
  const targetColorRange = getNumericColorRange(
    data,
    (d) => d.arcProperties?.targetColorValue,
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
        sourceColorRange,
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
        targetColorRange,
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
      getWidth: [settings.strokeWidth.defaultLineWidth.value, selectedIds],
      getSourceColor: [
        settings.defaultSourceColor.value.value,
        settings.defaultSourceOpacity.value,
        settings.sourceGradient.lowColor.value.value,
        settings.sourceGradient.useMiddleColor.value,
        settings.sourceGradient.middleColor.value.value,
        settings.sourceGradient.highColor.value.value,
        sourceColorRange.minValue,
        sourceColorRange.maxValue,
        highlighting.highlightOnClick.value,
        highlighting.unselectedFadeOpacity.value,
        selectedIds,
      ],
      getTargetColor: [
        settings.defaultTargetColor.value.value,
        settings.defaultTargetOpacity.value,
        settings.targetGradient.lowColor.value.value,
        settings.targetGradient.useMiddleColor.value,
        settings.targetGradient.middleColor.value.value,
        settings.targetGradient.highColor.value.value,
        targetColorRange.minValue,
        targetColorRange.maxValue,
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
