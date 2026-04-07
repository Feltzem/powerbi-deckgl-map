import { LineLayer } from "@deck.gl/layers";
import { InputLayerType, OurData } from "../dataTypes";
import { withOpacity, decodeHex } from "../col";
import { HighlightingCardSettings, LineCardSettings } from "../settings";
import { getLayerColorWithGradient, getNumericColorRange } from "./col";

export default function getLineLayer(
  dataPoints: OurData[],
  settings: LineCardSettings,
  highlighting: HighlightingCardSettings,
  selectedIds: Set<string>,
  onClick: (info: any, event: any) => void,
) {
  const defaultLineColor = withOpacity(
    decodeHex(settings.line.color.defaultLineColor.value.value, [0, 0, 0, 100]),
    settings.line.color.defaultLineOpacity.value,
  );
  const gradient = {
    lowColor: withOpacity(
      decodeHex(settings.gradient.lowColor.value.value, [44, 123, 182, 255]),
      settings.line.color.defaultLineOpacity.value,
    ),
    middleColor: settings.gradient.useMiddleColor.value
      ? withOpacity(
          decodeHex(
            settings.gradient.middleColor.value.value,
            [255, 255, 191, 255],
          ),
          settings.line.color.defaultLineOpacity.value,
        )
      : null,
    highColor: withOpacity(
      decodeHex(settings.gradient.highColor.value.value, [215, 25, 28, 255]),
      settings.line.color.defaultLineOpacity.value,
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
  const data = dataPoints.filter((x) => x.type === InputLayerType.Line);
  const lineColorRange = getNumericColorRange(
    data,
    (d) => d.lineProperties?.lineColorValue,
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
        lineColorRange,
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
      getWidth: [settings.line.width.defaultLineWidth.value, selectedIds],
      getColor: [
        settings.line.color.defaultLineColor.value.value,
        settings.line.color.defaultLineOpacity.value,
        settings.gradient.lowColor.value.value,
        settings.gradient.useMiddleColor.value,
        settings.gradient.middleColor.value.value,
        settings.gradient.highColor.value.value,
        lineColorRange.minValue,
        lineColorRange.maxValue,
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
