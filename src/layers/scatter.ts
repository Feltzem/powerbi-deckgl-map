import { ScatterplotLayer } from "@deck.gl/layers";
import { InputLayerType, OurData } from "../dataTypes";
import { decodeHex, withOpacity } from "../col";
import { HighlightingCardSettings, ScatterCardSettings } from "../settings";
import { getLayerColorWithGradient, getNumericColorRange } from "./col";

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
  const fillGradient = {
    lowColor: withOpacity(
      decodeHex(
        settings.fillGradient.lowColor.value.value,
        [44, 123, 182, 255],
      ),
      settings.fill.defaultFillOpacity.value,
    ),
    middleColor: settings.fillGradient.useMiddleColor.value
      ? withOpacity(
          decodeHex(
            settings.fillGradient.middleColor.value.value,
            [255, 255, 191, 255],
          ),
          settings.fill.defaultFillOpacity.value,
        )
      : null,
    highColor: withOpacity(
      decodeHex(
        settings.fillGradient.highColor.value.value,
        [215, 25, 28, 255],
      ),
      settings.fill.defaultFillOpacity.value,
    ),
  };
  const lineGradient = {
    lowColor: withOpacity(
      decodeHex(
        settings.lineGradient.lowColor.value.value,
        [44, 123, 182, 255],
      ),
      settings.line.color.defaultLineOpacity.value,
    ),
    middleColor: settings.lineGradient.useMiddleColor.value
      ? withOpacity(
          decodeHex(
            settings.lineGradient.middleColor.value.value,
            [255, 255, 191, 255],
          ),
          settings.line.color.defaultLineOpacity.value,
        )
      : null,
    highColor: withOpacity(
      decodeHex(
        settings.lineGradient.highColor.value.value,
        [215, 25, 28, 255],
      ),
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
  const data = dataPoints.filter((x) => x.type === InputLayerType.Scatter);
  const fillColorRange = getNumericColorRange(
    data,
    (d) => d.scatterProperties?.fillColorValue,
  );
  const lineColorRange = getNumericColorRange(
    data,
    (d) => d.scatterProperties?.lineColorValue,
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
        fillColorRange,
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
        lineColorRange,
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
        settings.fillGradient.lowColor.value.value,
        settings.fillGradient.useMiddleColor.value,
        settings.fillGradient.middleColor.value.value,
        settings.fillGradient.highColor.value.value,
        fillColorRange.minValue,
        fillColorRange.maxValue,
        highlighting.highlightOnClick.value,
        highlighting.unselectedFadeOpacity.value,
        selectedIds,
      ],
      getLineColor: [
        settings.line.color.defaultLineColor.value.value,
        settings.line.color.defaultLineOpacity.value,
        settings.lineGradient.lowColor.value.value,
        settings.lineGradient.useMiddleColor.value,
        settings.lineGradient.middleColor.value.value,
        settings.lineGradient.highColor.value.value,
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
