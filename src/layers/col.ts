import { RGBAColor, withScaledOpacity } from "../col";
import {
  getCachedNumericColorBins,
  getGradientClassColors,
  getGradientColorForValueFromClasses,
  getManualClassColors,
  NumericColorBins,
  NumericColorBinsCache,
  NumericGradientClassificationSettings,
} from "../gradientClassification";
import { ColorRoleStats } from "../dataTypes";
import { getColorRoleCategorySignature } from "../colorRoles";

export interface NumericColorGradient {
  lowColor: RGBAColor;
  middleColor?: RGBAColor | null;
  highColor: RGBAColor;
}

export type ColorPropertyAccessor<T> = (item: T) => RGBAColor | null | undefined;
export type NumericColorAccessor<T> = (item: T) => number | null | undefined;
export type CategoricalColorAccessor<T> = (item: T) => string | null | undefined;

export interface LayerColorAccessorOptions<T> {
  items: T[],
  colorStats: ColorRoleStats;
  classificationCache: NumericColorBinsCache;
  cacheKey: string;
  getColorValue: ColorPropertyAccessor<T>;
  getNumericColorValue: NumericColorAccessor<T>;
  getCategoricalColorValue: CategoricalColorAccessor<T>;
  getCategoricalColor: (category: string) => RGBAColor;
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
  usesCategorical: boolean;
  categoricalSignature: string;
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

export const getLayerColorWithCategoryBase = (
  colorProp: RGBAColor | null | undefined,
  categoricalColorValue: string | null | undefined,
  defaultColor: RGBAColor,
  getCategoricalColor: (category: string) => RGBAColor,
): RGBAColor => {
  if (colorProp) {
    return colorProp;
  }

  if (categoricalColorValue) {
    return getCategoricalColor(categoricalColorValue);
  }

  return defaultColor;
};

export const getLayerColorWithCategory = (
  colorProp: RGBAColor | null | undefined,
  categoricalColorValue: string | null | undefined,
  defaultColor: RGBAColor,
  getCategoricalColor: (category: string) => RGBAColor,
  shouldFade: boolean,
  fadeFactor: number,
  selectedIds: Set<string>,
  id: string,
): RGBAColor => {
  const color = getLayerColorWithCategoryBase(
    colorProp,
    categoricalColorValue,
    defaultColor,
    getCategoricalColor,
  );
  return getLayerColorWithSelectionFade(
    color,
    shouldFade,
    fadeFactor,
    selectedIds,
    id,
  );
};

const createCategoricalColorLookup = (
  colorStats: ColorRoleStats,
  getCategoricalColor: (category: string) => RGBAColor,
): ((category: string) => RGBAColor) => {
  const colorMap = new Map<string, RGBAColor>();
  for (const category of colorStats.categoryOrder) {
    colorMap.set(category, getCategoricalColor(category));
  }

  return (category: string) => colorMap.get(category) ?? getCategoricalColor(category);
};

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
  getCategoricalColorValue,
  getCategoricalColor,
  getId,
  defaultColor,
  getGradient,
  gradientSettings,
  shouldFade,
  fadeFactor,
  selectedIds,
}: LayerColorAccessorOptions<T>): LayerColorAccessorResult<T> => {
  const shouldApplyFade = shouldFade && fadeFactor < 1;
  const categoricalSignature = getColorRoleCategorySignature(colorStats);

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
    const gradientClassColors =
      bins && bins.classCount > 0 ? getGradientClassColors(bins, gradient) : [];
    const manualOverride =
      bins && gradientSettings.method === "manual-interval"
        ? getManualClassColors(
            bins,
            gradientSettings.manualColors ?? "",
            gradient.lowColor[3],
          )
        : null;
    const classColors = manualOverride ?? gradientClassColors;

    if (shouldApplyFade) {
      return {
        bins,
        usesGradient: true,
        usesCategorical: false,
        categoricalSignature,
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
      usesCategorical: false,
      categoricalSignature,
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

  if (colorStats.hasCategoricalColor) {
    const getCachedCategoricalColor = createCategoricalColorLookup(
      colorStats,
      getCategoricalColor,
    );

    if (shouldApplyFade) {
      return {
        bins: null,
        usesGradient: false,
        usesCategorical: true,
        categoricalSignature,
        accessor: (item: T) =>
          getLayerColorWithCategory(
            getColorValue(item),
            getCategoricalColorValue(item),
            defaultColor,
            getCachedCategoricalColor,
            true,
            fadeFactor,
            selectedIds,
            getId(item),
          ),
      };
    }

    return {
      bins: null,
      usesGradient: false,
      usesCategorical: true,
      categoricalSignature,
      accessor: (item: T) =>
        getLayerColorWithCategoryBase(
          getColorValue(item),
          getCategoricalColorValue(item),
          defaultColor,
          getCachedCategoricalColor,
        ),
    };
  }

  if (shouldApplyFade) {
    return {
      bins: null,
      usesGradient: false,
      usesCategorical: false,
      categoricalSignature,
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
      usesCategorical: false,
      categoricalSignature,
      accessor: (item: T) => getLayerColor(getColorValue(item), defaultColor),
    };
  }

  return {
    accessor: defaultColor,
    bins: null,
    usesGradient: false,
    usesCategorical: false,
    categoricalSignature,
  };
};

export const getLayerColorUpdateTriggers = <T>(
  baseTriggers: unknown[],
  gradientTriggers: unknown[],
  categoricalTriggers: unknown[],
  colorAccessor: LayerColorAccessorResult<T>,
  highlightOnClick: boolean,
  unselectedFadeOpacity: number,
  selectedSignature: string,
): unknown[] => [
  ...baseTriggers,
  ...(colorAccessor.usesGradient ? gradientTriggers : []),
  ...(colorAccessor.usesCategorical ? categoricalTriggers : []),
  highlightOnClick,
  unselectedFadeOpacity,
  ...(highlightOnClick ? [selectedSignature] : []),
];
