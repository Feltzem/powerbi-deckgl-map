import { decodeHex, RGBAColor, withScaledOpacity } from "../col";
import {
  getGradientColorForValue,
  getNumericColorRange,
  NumericColorBins,
  NumericColorRange,
} from "../gradientClassification";

export interface NumericColorGradient {
  lowColor: RGBAColor;
  middleColor?: RGBAColor | null;
  highColor: RGBAColor;
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
  bins: NumericColorBins,
  shouldFade: boolean,
  fadeFactor: number,
  selectedIds: Set<string>,
  id: string,
): RGBAColor => {
  if (
    typeof numericColorValue === "number" &&
    isFinite(numericColorValue) &&
    bins.minValue !== null &&
    bins.maxValue !== null &&
    bins.classCount > 0
  ) {
    const gradientColor = getGradientColorForValue(
      numericColorValue,
      bins,
      gradient,
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
