import { GeoJsonLayer } from "@deck.gl/layers";
import { InputLayerType, OurData } from "../dataTypes";
import { withOpacity, decodeHex } from "../col";
import {
  GradientBinningMethod,
  getNumericColorBins,
  getNumericColorBinsSignature,
} from "../gradientClassification";
import { resolveGradientPresetColors } from "../gradientPresets";
import { HighlightingCardSettings, PolygonCardSettings } from "../settings";
import { getLayerColorWithGradient } from "./col";

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
  const lineGradient = resolveGradientPresetColors(
    settings.lineGradient.preset.value.value as string,
    settings.line.color.defaultLineOpacity.value,
  );
  const fillGradient = resolveGradientPresetColors(
    settings.fillGradient.preset.value.value as string,
    settings.fill.defaultFillOpacity.value,
  );
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
  const lineColorBins = getNumericColorBins(
    data,
    (d) => d.polygonProperties?.lineColorValue,
    {
      method: settings.lineGradient.binningMethod.value
        .value as GradientBinningMethod,
      classCount: settings.lineGradient.classCount.value,
      definedInterval: settings.lineGradient.definedInterval.value,
    },
  );
  const fillColorBins = getNumericColorBins(
    data,
    (d) => d.polygonProperties?.fillColorValue,
    {
      method: settings.fillGradient.binningMethod.value
        .value as GradientBinningMethod,
      classCount: settings.fillGradient.classCount.value,
      definedInterval: settings.fillGradient.definedInterval.value,
    },
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
        lineColorBins,
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
        fillColorBins,
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
        settings.lineGradient.preset.value.value,
        settings.lineGradient.binningMethod.value.value,
        settings.lineGradient.classCount.value,
        settings.lineGradient.definedInterval.value,
        getNumericColorBinsSignature(lineColorBins),
        highlighting.highlightOnClick.value,
        highlighting.unselectedFadeOpacity.value,
        selectedIds,
      ],
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
