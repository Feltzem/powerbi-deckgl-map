import { decodeHex, RGBAColor, withScaledOpacity } from "../col";
import {
  getCachedNumericColorBins,
  getGradientColorForValue,
  NumericColorBins,
  NumericColorBinsCache,
  NumericGradientClassificationSettings,
} from "../gradientClassification";
import { ColorRoleStats } from "../dataTypes";

export interface NumericColorGradient {
  lowColor: RGBAColor;
  middleColor?: RGBAColor | null;
  highColor: RGBAColor;
}

export type ColorPropertyAccessor<T> = (item: T) => string | null | undefined;
export type NumericColorAccessor<T> = (item: T) => number | null | undefined;

export interface LayerColorAccessorOptions<T> {
  items: T[],
  colorStats: ColorRoleStats;
  classificationCache: NumericColorBinsCache;
  cacheKey: string;
  getColorValue: ColorPropertyAccessor<T>;
  getNumericColorValue: NumericColorAccessor<T>;
  getId: (item: T) => string;
  defaultColor: RGBAColor;
  getGradient: () => NumericColorGradient;
  gradientSettings: NumericGradientClassificationSettings;
  shouldFade: boolean;
  fadeFactor: number;
  selectedIds: Set<string>;
}

export interface LayerColorAccessorResult<T> {
  accessor: RGBAColor | ((item: T) => RGBAColor);
  bins: NumericColorBins | null;
  usesGradient: boolean;
}

export const applySelectionFade = (
  color: RGBAColor,
  shouldFade: boolean,
  fadeFactor: number,
  selectedIds: Set<string>,
  id: string,
): RGBAColor => {
  // If we don't have highlighting enabled or there are no selected items, we can skip the extra calculations and just return the line color:
  if (!shouldFade) {
    return color;
  }
  // We have selected items, so we need to fade unselected ones. Check if this item is selected:
  const selected = selectedIds.has(id);
  return withScaledOpacity(color, selected ? 1 : fadeFactor);
};

export const getLayerColor = (
  colorProp: string | null | undefined,
  defaultColor: RGBAColor,
): RGBAColor => decodeHex(colorProp, defaultColor);

export const getLayerColorWithGradientBase = (
  colorProp: string | null | undefined,
  numericColorValue: number | null | undefined,
  defaultColor: RGBAColor,
  gradient: NumericColorGradient,
  bins: NumericColorBins | null,
): RGBAColor => {
  if (
    bins &&
    typeof numericColorValue === "number" &&
    isFinite(numericColorValue) &&
    bins.minValue !== null &&
    bins.maxValue !== null &&
    bins.classCount > 0
  ) {
    return getGradientColorForValue(numericColorValue, bins, gradient);
  }

  return getLayerColor(colorProp, defaultColor);
};

export const getLayerColorWithSelectionFade = (
  color: RGBAColor,
  shouldFade: boolean,
  fadeFactor: number,
  selectedIds: Set<string>,
  id: string,
): RGBAColor =>
  applySelectionFade(color, shouldFade, fadeFactor, selectedIds, id);

export const getLayerColorWithGradient = (
  colorProp: string | null | undefined,
  numericColorValue: number | null | undefined,
  defaultColor: RGBAColor,
  gradient: NumericColorGradient,
  bins: NumericColorBins | null,
  shouldFade: boolean,
  fadeFactor: number,
  selectedIds: Set<string>,
  id: string,
): RGBAColor => {
  const color = getLayerColorWithGradientBase(
    colorProp,
    numericColorValue,
    defaultColor,
    gradient,
    bins,
  );
  return getLayerColorWithSelectionFade(
    color,
    shouldFade,
    fadeFactor,
    selectedIds,
    id,
  );
};

export const createLayerColorAccessor = <T>({
  items,
  colorStats,
  classificationCache,
  cacheKey,
  getColorValue,
  getNumericColorValue,
  getId,
  defaultColor,
  getGradient,
  gradientSettings,
  shouldFade,
  fadeFactor,
  selectedIds,
}: LayerColorAccessorOptions<T>): LayerColorAccessorResult<T> => {
  if (colorStats.hasNumericColor) {
    const bins = getCachedNumericColorBins(
      classificationCache,
      cacheKey,
      items,
      getNumericColorValue,
      gradientSettings,
      colorStats,
    );
    const gradient = getGradient();

    return {
      bins,
      usesGradient: true,
      accessor: (item: T) =>
        getLayerColorWithGradient(
          getColorValue(item),
          getNumericColorValue(item),
          defaultColor,
          gradient,
          bins,
          shouldFade,
          fadeFactor,
          selectedIds,
          getId(item),
        ),
    };
  }

  if (shouldFade) {
    return {
      bins: null,
      usesGradient: false,
      accessor: (item: T) =>
        getLayerColorWithSelectionFade(
          getLayerColor(getColorValue(item), defaultColor),
          true,
          fadeFactor,
          selectedIds,
          getId(item),
        ),
    };
  }

  if (colorStats.hasTextColor) {
    return {
      bins: null,
      usesGradient: false,
      accessor: (item: T) => getLayerColor(getColorValue(item), defaultColor),
    };
  }

  return {
    accessor: defaultColor,
    bins: null,
    usesGradient: false,
  };
};

export const getLayerColorUpdateTriggers = <T>(
  baseTriggers: unknown[],
  gradientTriggers: unknown[],
  colorAccessor: LayerColorAccessorResult<T>,
  highlightOnClick: boolean,
  unselectedFadeOpacity: number,
  selectedSignature: string,
): unknown[] => [
  ...baseTriggers,
  ...(colorAccessor.usesGradient ? gradientTriggers : []),
  highlightOnClick,
  unselectedFadeOpacity,
  ...(highlightOnClick ? [selectedSignature] : []),
];
