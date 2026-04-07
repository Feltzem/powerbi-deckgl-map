import {
  decodeHex,
  interpolateGradientColor,
  RGBAColor,
  withScaledOpacity,
} from "../col";

export interface NumericColorGradient {
  lowColor: RGBAColor;
  middleColor?: RGBAColor | null;
  highColor: RGBAColor;
}

export interface NumericColorRange {
  minValue: number | null;
  maxValue: number | null;
}

export const getNumericColorRange = <T>(
  items: T[],
  getNumericValue: (item: T) => number | null | undefined,
): NumericColorRange => {
  let minValue: number | null = null;
  let maxValue: number | null = null;

  for (const item of items) {
    const numericValue = getNumericValue(item);
    if (typeof numericValue !== "number" || !isFinite(numericValue)) {
      continue;
    }

    minValue =
      minValue === null ? numericValue : Math.min(minValue, numericValue);
    maxValue =
      maxValue === null ? numericValue : Math.max(maxValue, numericValue);
  }

  return { minValue, maxValue };
};

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
  shouldFade: boolean,
  fadeFactor: number,
  selectedIds: Set<string>,
  id: string,
): RGBAColor => {
  const col = decodeHex(colorProp, defaultColor);
  return applySelectionFade(col, shouldFade, fadeFactor, selectedIds, id);
};

export const getLayerColorWithGradient = (
  colorProp: string | null | undefined,
  numericColorValue: number | null | undefined,
  defaultColor: RGBAColor,
  gradient: NumericColorGradient,
  range: NumericColorRange,
  shouldFade: boolean,
  fadeFactor: number,
  selectedIds: Set<string>,
  id: string,
): RGBAColor => {
  if (
    typeof numericColorValue === "number" &&
    isFinite(numericColorValue) &&
    range.minValue !== null &&
    range.maxValue !== null
  ) {
    const gradientColor = interpolateGradientColor(
      numericColorValue,
      range.minValue,
      range.maxValue,
      gradient.lowColor,
      gradient.highColor,
      gradient.middleColor,
    );
    return applySelectionFade(
      gradientColor,
      shouldFade,
      fadeFactor,
      selectedIds,
      id,
    );
  }

  return getLayerColor(
    colorProp,
    defaultColor,
    shouldFade,
    fadeFactor,
    selectedIds,
    id,
  );
};
