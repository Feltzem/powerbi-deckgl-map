import { RGBAColor, withScaledOpacity } from "../col";
import {
  getCachedNumericColorBins,
  getGradientClassColors,
  getGradientColorForValueFromClasses,
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

export type ColorPropertyAccessor<T> = (item: T) => RGBAColor | null | undefined;
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
  if (!shouldFade || fadeFactor >= 1) {
    return color;
  }

  return selectedIds.has(id) ? color : withScaledOpacity(color, fadeFactor);
};

export const getLayerColor = (
  colorProp: RGBAColor | null | undefined,
  defaultColor: RGBAColor,
): RGBAColor => colorProp ?? defaultColor;

export const getLayerColorWithGradientBase = (
  colorProp: RGBAColor | null | undefined,
  numericColorValue: number | null | undefined,
  defaultColor: RGBAColor,
  bins: NumericColorBins | null,
  classColors: RGBAColor[],
): RGBAColor => {
  if (
    bins &&
    typeof numericColorValue === "number" &&
    isFinite(numericColorValue) &&
    bins.minValue !== null &&
    bins.maxValue !== null &&
    bins.classCount > 0
  ) {
    return getGradientColorForValueFromClasses(numericColorValue, bins, classColors);
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
  colorProp: RGBAColor | null | undefined,
  numericColorValue: number | null | undefined,
  defaultColor: RGBAColor,
  bins: NumericColorBins | null,
  classColors: RGBAColor[],
  shouldFade: boolean,
  fadeFactor: number,
  selectedIds: Set<string>,
  id: string,
): RGBAColor => {
  const color = getLayerColorWithGradientBase(
    colorProp,
    numericColorValue,
    defaultColor,
    bins,
    classColors,
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
  const shouldApplyFade = shouldFade && fadeFactor < 1;

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
    const classColors =
      bins && bins.classCount > 0 ? getGradientClassColors(bins, gradient) : [];

    if (shouldApplyFade) {
      return {
        bins,
        usesGradient: true,
        accessor: (item: T) =>
          getLayerColorWithGradient(
            getColorValue(item),
            getNumericColorValue(item),
            defaultColor,
            bins,
            classColors,
            true,
            fadeFactor,
            selectedIds,
            getId(item),
          ),
      };
    }

    return {
      bins,
      usesGradient: true,
      accessor: (item: T) =>
        getLayerColorWithGradientBase(
          getColorValue(item),
          getNumericColorValue(item),
          defaultColor,
          bins,
          classColors,
        ),
    };
  }

  if (shouldApplyFade) {
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
