import { GeoJsonLayer } from "@deck.gl/layers";
import type { PickingInfo, Position } from "@deck.gl/core";
import { ColorRoleStatsStore, PathFeature } from "../dataTypes";
import { withOpacity, decodeHex } from "../col";
import {
  GradientBinningMethod,
  getNumericColorBinsSignature,
  NumericColorBinsCache,
} from "../gradientClassification";
import { resolveGradientPresetColors } from "../gradientPresets";
import { getCategoricalPaletteColor } from "../categoricalPalettes";
import { HighlightingCardSettings, PathCardSettings } from "../settings";
import { LAYER_IDS } from "../layerState";
import {
  createLayerColorAccessor,
  getLayerColorUpdateTriggers,
} from "./col";
import TemporallyAppearingPathLayer from "./temporallyAppearingPathLayer";
import { AnimationContext } from "../timeAnimation";

/** One drawable path with a back-reference to its source feature. */
interface FlatPath {
  path: Position[];
  feature: PathFeature;
}

/**
 * Flatten path features into one entry per LineString. A MultiLineString
 * becomes several entries that share the same source feature (and timestamp),
 * because the raw PathLayer draws one path per data item.
 */
const flattenPaths = (data: PathFeature[]): FlatPath[] => {
  const flat: FlatPath[] = [];
  for (const feature of data) {
    const geometry = feature.geometry;
    if (geometry.type === "LineString") {
      flat.push({ path: geometry.coordinates as Position[], feature });
    } else if (geometry.type === "MultiLineString") {
      for (const line of geometry.coordinates) {
        flat.push({ path: line as Position[], feature });
      }
    }
  }
  return flat;
};

/**
 * Cache the flattened paths per data version so the animated PathLayer keeps a
 * stable `data` reference across frames. A fresh array each frame would force
 * deck.gl to re-tesselate every path on every tick.
 */
let flatPathCache: { version: string; source: PathFeature[]; flat: FlatPath[] } | null =
  null;

const getFlatPaths = (data: PathFeature[], version: string): FlatPath[] => {
  if (
    flatPathCache &&
    flatPathCache.version === version &&
    flatPathCache.source === data
  ) {
    return flatPathCache.flat;
  }
  const flat = flattenPaths(data);
  flatPathCache = { version, source: data, flat };
  return flat;
};

export default function getPathLayer(
  data: PathFeature[],
  settings: PathCardSettings,
  highlighting: HighlightingCardSettings,
  selectedIds: Set<string>,
  selectedSignature: string,
  colorRoles: ColorRoleStatsStore,
  classificationCache: NumericColorBinsCache,
  dataVersion: string,
  onClick: (info: PickingInfo, event: unknown) => void,
  animation: AnimationContext | null = null,
) {
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
  const gradientSettings = {
    method: settings.gradient.binningMethod.value
      .value as GradientBinningMethod,
    classCount: settings.gradient.classCount.value,
    definedInterval: settings.gradient.definedInterval.value,
    manualBreaks: settings.gradient.manualBreaks.value,
    manualColors: settings.gradient.manualColors.value,
  };
  const lineColor = createLayerColorAccessor<PathFeature>({
    items: data,
    colorStats: colorRoles.pathColor,
    classificationCache,
    cacheKey: `${dataVersion}:path`,
    getColorValue: (d) => d.properties?.lineColor,
    getNumericColorValue: (d) => d.properties?.lineColorValue,
    getCategoricalColorValue: (d) => d.properties?.lineColorCategory,
    getCategoricalColor: (category) =>
      getCategoricalPaletteColor(
        category,
        settings.categoricalPalette.palette.value.value as string,
        settings.line.color.defaultLineOpacity.value,
      ),
    getId: (d) => String(d.id),
    defaultColor: defaultLineColor,
    getGradient: () =>
      resolveGradientPresetColors(
        settings.gradient.preset.value.value as string,
        settings.line.color.defaultLineOpacity.value,
      ),
    gradientSettings,
    shouldFade: shouldFadeUnselected,
    fadeFactor,
    selectedIds,
  });

  const hasZ = data.some((feature) => feature.hasZ);

  const resolveLineWidth = (feature: PathFeature): number => {
    const w = feature.properties?.lineWidth;
    if (typeof w === "number" && isFinite(w) && w > 0) {
      return w;
    }
    return settings.line.width.defaultLineWidth.value;
  };
  const resolveLineColor = (feature: PathFeature) =>
    typeof lineColor.accessor === "function"
      ? lineColor.accessor(feature)
      : lineColor.accessor;

  if (animation?.active) {
    const flat = getFlatPaths(data, dataVersion);
    return new TemporallyAppearingPathLayer<FlatPath>({
      id: LAYER_IDS.path,
      data: flat,
      pickable: true,
      positionFormat: hasZ ? "XYZ" : "XY",
      getPath: (d) => d.path,
      getColor: (d) => resolveLineColor(d.feature),
      getWidth: (d) => resolveLineWidth(d.feature),
      // One timestamp per feature, so the whole path appears/disappears
      // together within the trailing window. Untimed paths carry the flag 0
      // and always render.
      getSourceTimestamp: (d) => d.feature.timestampSeconds ?? 0,
      getTargetTimestamp: (d) => d.feature.timestampSeconds ?? 0,
      getHasTimestamp: (d) => (d.feature.timestampSeconds === null ? 0 : 1),
      timeRange: [
        animation.time - animation.trailLength,
        animation.time,
      ],
      widthUnits: "meters",
      widthMinPixels: settings.line.width.lineWidthMinPixels.value,
      widthMaxPixels: settings.line.width.lineWidthMaxPixels.value,
      capRounded: settings.path.lineCapRounded.value,
      jointRounded: settings.path.lineJointRounded.value,
      miterLimit: settings.path.lineMiterLimit.value,
      billboard: settings.billboard.billboard.value,
      autoHighlight: highlighting.autoHighlight.value,
      highlightColor: autoHighlightColor,
      onClick: (info, event) => onClick(info, event),
      updateTriggers: {
        getColor: getLayerColorUpdateTriggers(
          [
            settings.line.color.defaultLineColor.value.value,
            settings.line.color.defaultLineOpacity.value,
          ],
          [
            settings.gradient.preset.value.value,
            settings.gradient.binningMethod.value.value,
            settings.gradient.classCount.value,
            settings.gradient.definedInterval.value,
            settings.gradient.manualBreaks.value,
            settings.gradient.manualColors.value,
            getNumericColorBinsSignature(lineColor.bins),
          ],
          [
            settings.categoricalPalette.palette.value.value,
            lineColor.categoricalSignature,
          ],
          lineColor,
          highlighting.highlightOnClick.value,
          highlighting.unselectedFadeOpacity.value,
          selectedSignature,
        ),
        getWidth: [settings.line.width.defaultLineWidth.value],
        getSourceTimestamp: [dataVersion],
        getTargetTimestamp: [dataVersion],
        getHasTimestamp: [dataVersion],
      },
    });
  }

  return new GeoJsonLayer({
    id: LAYER_IDS.path,
    data,
    pickable: true,
    // 3D WKP paths decode to [x, y, z]; tell deck.gl to read the Z so the
    // line floats at its baked elevation instead of being truncated to ground.
    positionFormat: hasZ ? "XYZ" : "XY",
    getLineWidth: (d) => {
      const w = d.properties?.lineWidth;
      if (typeof w === "number" && isFinite(w) && w > 0) {
        return w;
      }
      return settings.line.width.defaultLineWidth.value;
    },
    getLineColor: lineColor.accessor,
    lineWidthMinPixels: settings.line.width.lineWidthMinPixels.value,
    lineWidthMaxPixels: settings.line.width.lineWidthMaxPixels.value,
    lineCapRounded: settings.path.lineCapRounded.value,
    lineJointRounded: settings.path.lineJointRounded.value,
    lineMiterLimit: settings.path.lineMiterLimit.value,
    lineBillboard: settings.billboard.billboard.value,
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
          settings.gradient.preset.value.value,
          settings.gradient.binningMethod.value.value,
          settings.gradient.classCount.value,
          settings.gradient.definedInterval.value,
          settings.gradient.manualBreaks.value,
          settings.gradient.manualColors.value,
          getNumericColorBinsSignature(lineColor.bins),
        ],
        [
          settings.categoricalPalette.palette.value.value,
          lineColor.categoricalSignature,
        ],
        lineColor,
        highlighting.highlightOnClick.value,
        highlighting.unselectedFadeOpacity.value,
        selectedSignature,
      ),
      getLineCapRounded: [settings.path.lineCapRounded.value],
      getLineJointRounded: [settings.path.lineJointRounded.value],
      getLineMiterLimit: [settings.path.lineMiterLimit.value],
      getLineBillboard: [settings.billboard.billboard.value],
      highlightColor: [
        highlighting.autoHighlightColor.value.value,
        highlighting.autoHighlightOpacity.value,
      ],
    },
  });
}
