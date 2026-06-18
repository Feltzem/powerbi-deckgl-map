import { GeoJsonLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { ColorRoleStatsStore, PolygonFeature } from "../dataTypes";
import { withOpacity, decodeHex } from "../col";
import {
  GradientBinningMethod,
  getNumericColorBinsSignature,
  NumericColorBinsCache,
} from "../gradientClassification";
import { resolveGradientPresetColors } from "../gradientPresets";
import { getCategoricalPaletteColor } from "../categoricalPalettes";
import { HighlightingCardSettings, PolygonCardSettings } from "../settings";
import { LAYER_IDS } from "../layerState";
import {
  createLayerColorAccessor,
  getLayerColorUpdateTriggers,
} from "./col";

export default function getPolygonLayer(
  data: PolygonFeature[],
  settings: PolygonCardSettings,
  highlighting: HighlightingCardSettings,
  selectedIds: Set<string>,
  selectedSignature: string,
  colorRoles: ColorRoleStatsStore,
  classificationCache: NumericColorBinsCache,
  dataVersion: string,
  onClick: (info: PickingInfo, event: unknown) => void,
) {
  const defaultLineColor = withOpacity(
    decodeHex(settings.line.color.defaultLineColor.value.value, [0, 0, 0, 100]),
    settings.line.color.defaultLineOpacity.value,
  );
  const defaultFillColor = withOpacity(
    decodeHex(settings.fill.defaultFillColor.value.value, [0, 0, 0, 100]),
    settings.fill.defaultFillOpacity.value,
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
  const lineGradientSettings = {
    method: settings.lineGradient.binningMethod.value
      .value as GradientBinningMethod,
    classCount: settings.lineGradient.classCount.value,
    definedInterval: settings.lineGradient.definedInterval.value,
    manualBreaks: settings.lineGradient.manualBreaks.value,
    manualColors: settings.lineGradient.manualColors.value,
  };
  const fillGradientSettings = {
    method: settings.fillGradient.binningMethod.value
      .value as GradientBinningMethod,
    classCount: settings.fillGradient.classCount.value,
    definedInterval: settings.fillGradient.definedInterval.value,
    manualBreaks: settings.fillGradient.manualBreaks.value,
    manualColors: settings.fillGradient.manualColors.value,
  };
  const lineColor = createLayerColorAccessor<PolygonFeature>({
    items: data,
    colorStats: colorRoles.polygonLineColor,
    classificationCache,
    cacheKey: `${dataVersion}:polygon-line`,
    getColorValue: (d) => d.properties?.lineColor,
    getNumericColorValue: (d) => d.properties?.lineColorValue,
    getCategoricalColorValue: (d) => d.properties?.lineColorCategory,
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
  const fillColor = createLayerColorAccessor<PolygonFeature>({
    items: data,
    colorStats: colorRoles.polygonFillColor,
    classificationCache,
    cacheKey: `${dataVersion}:polygon-fill`,
    getColorValue: (d) => d.properties?.fillColor,
    getNumericColorValue: (d) => d.properties?.fillColorValue,
    getCategoricalColorValue: (d) => d.properties?.fillColorCategory,
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

  const hasZ = data.some((feature) => feature.hasZ);

  return new GeoJsonLayer({
    id: LAYER_IDS.polygon,
    data,
    pickable: true,
    // 3D WKP polygons decode to rings of [x, y, z]; reading the Z lets the ring
    // sit at its baked base elevation (the floating-prism base in slice 2).
    positionFormat: hasZ ? "XYZ" : "XY",
    stroked: settings.stroked.value,
    getLineColor: lineColor.accessor,
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
    getFillColor: fillColor.accessor,
    // When a ring carries Z (3D WKP), that Z becomes the prism base and
    // getElevation is the height added on top (deck.gl does pos.z += elevation),
    // yielding a floating prism. Force extrusion on so the walls render even if
    // the user has left the Extruded toggle off for 2D polygons.
    extruded: hasZ || settings.extruded.value,
    getElevation: (d) => d.properties?.elevation ?? 0,
    wireframe: settings.wireframe.value,
    lineJointRounded: settings.path.lineJointRounded.value,
    lineMiterLimit: settings.path.lineMiterLimit.value,
    autoHighlight: highlighting.autoHighlight.value,
    highlightColor: autoHighlightColor,
    onClick: (info, event) => onClick(info, event),
    updateTriggers: {
      getLineWidth: [settings.line.width.defaultLineWidth.value],
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
