import { GeoJsonLayer } from "@deck.gl/layers";
import { InputLayerType, OurData } from "../dataTypes";
import { withOpacity, decodeHex } from "../col";
import { HighlightingCardSettings, PolygonCardSettings } from "../settings";
import { getLayerColorWithGradient, getNumericColorRange } from "./col";

export default function getPolygonLayer(
  dataPoints: OurData[],
  settings: PolygonCardSettings,
  highlighting: HighlightingCardSettings,
  selectedIds: Set<string>,
  onClick: (info: any, event: any) => void,
) {
  const defaultLineColor = withOpacity(
    decodeHex(settings.line.color.defaultLineColor.value.value, [0, 0, 0, 100]),
    settings.line.color.defaultLineOpacity.value,
  );
  const defaultFillColor = withOpacity(
    decodeHex(settings.fill.defaultFillColor.value.value, [0, 0, 0, 100]),
    settings.fill.defaultFillOpacity.value,
  );
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
  const fadeFactor = Math.max(
    0,
    Math.min(1, highlighting.unselectedFadeOpacity.value / 100),
  ); // convert percentage to 0-1 range and clamp
  const shouldFadeUnselected =
    highlighting.highlightOnClick.value && selectedIds.size > 0;
  const autoHighlightColor = withOpacity(
    decodeHex(highlighting.autoHighlightColor.value.value, [255, 153, 0, 255]),
    highlighting.autoHighlightOpacity.value,
  );
  const data = dataPoints.filter((x) => x.type === InputLayerType.Polygon);
  const lineColorRange = getNumericColorRange(
    data,
    (d) => d.polygonProperties?.lineColorValue,
  );
  const fillColorRange = getNumericColorRange(
    data,
    (d) => d.polygonProperties?.fillColorValue,
  );

  const featureCollection = data.map((d) => ({
    type: "Feature" as const,
    geometry: d.polygonData,
    properties: d.polygonProperties,
    selectionId: d.selectionId,
    tooltipHtml: d.tooltipHtml,
    id: d.id,
  }));

  return new GeoJsonLayer({
    id: `polygon-layer-base`,
    data: featureCollection,
    pickable: true,
    stroked: settings.stroked.value,
    getLineColor: (d) =>
      getLayerColorWithGradient(
        d.properties?.lineColor,
        d.properties?.lineColorValue,
        defaultLineColor,
        lineGradient,
        lineColorRange,
        shouldFadeUnselected,
        fadeFactor,
        selectedIds,
        String(d.id),
      ),
    getLineWidth: (d) => {
      const w = d.properties?.lineWidth;
      if (typeof w === "number" && isFinite(w) && w > 0) {
        return w;
      }
      return settings.line.width.defaultLineWidth.value;
    },
    lineWidthMinPixels: settings.line.width.lineWidthMinPixels.value,
    lineWidthMaxPixels: settings.line.width.lineWidthMaxPixels.value,
    filled: settings.filled.value,
    getFillColor: (d) =>
      getLayerColorWithGradient(
        d.properties?.fillColor,
        d.properties?.fillColorValue,
        defaultFillColor,
        fillGradient,
        fillColorRange,
        shouldFadeUnselected,
        fadeFactor,
        selectedIds,
        String(d.id),
      ),
    extruded: settings.extruded.value,
    getElevation: (d) => d.properties?.elevation,
    wireframe: settings.wireframe.value,
    lineJointRounded: settings.path.lineJointRounded.value,
    lineMiterLimit: settings.path.lineMiterLimit.value,
    autoHighlight: highlighting.autoHighlight.value,
    highlightColor: autoHighlightColor,
    onClick: (info, event) => onClick(info, event),
    updateTriggers: {
      getLineWidth: [settings.line.width.defaultLineWidth.value, selectedIds],
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
      getCapRounded: [settings.path.lineCapRounded.value],
      getJointRounded: [settings.path.lineJointRounded.value],
      getMiterLimit: [settings.path.lineMiterLimit.value],
      getBillboard: [settings.billboard.billboard.value],
      highlightColor: [
        highlighting.autoHighlightColor.value.value,
        highlighting.autoHighlightOpacity.value,
      ],
    },
  });
}
