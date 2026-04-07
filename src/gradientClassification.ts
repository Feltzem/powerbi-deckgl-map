import { interpolateGradientColor, RGBAColor } from "./col";

export type GradientBinningMethod =
  | "natural-breaks"
  | "quantile"
  | "equal-interval"
  | "defined-interval";

export interface NumericColorRange {
  minValue: number | null;
  maxValue: number | null;
}

export interface NumericColorBins extends NumericColorRange {
  breaks: number[];
  classCount: number;
}

export interface GradientLegendClass {
  key: string;
  lowValue: number;
  highValue: number;
  color: RGBAColor;
}

interface GradientLike {
  lowColor: RGBAColor;
  middleColor?: RGBAColor | null;
  highColor: RGBAColor;
}

export interface NumericGradientClassificationSettings {
  method: GradientBinningMethod;
  classCount: number;
  definedInterval: number;
}

export const defaultGradientBinningMethod: GradientBinningMethod =
  "equal-interval";
export const defaultGradientClassCount = 5;
export const defaultGradientDefinedInterval = 10;

export const gradientBinningMethodItems = [
  {
    value: "natural-breaks",
    displayName: "Natural breaks (Jenks)",
  },
  {
    value: "quantile",
    displayName: "Quantile",
  },
  {
    value: "equal-interval",
    displayName: "Equal interval",
  },
  {
    value: "defined-interval",
    displayName: "Defined interval",
  },
];

export const getGradientBinningMethodDisplayName = (
  method: string | null | undefined,
): string => {
  const match = gradientBinningMethodItems.find(
    (item) => item.value === method,
  );
  return match?.displayName ?? "Equal interval";
};

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

const getFiniteNumericValues = <T>(
  items: T[],
  getNumericValue: (item: T) => number | null | undefined,
): number[] =>
  items
    .map((item) => getNumericValue(item))
    .filter(
      (value): value is number => typeof value === "number" && isFinite(value),
    )
    .sort((left, right) => left - right);

const clampClassCount = (classCount: number, fallback: number): number => {
  if (!Number.isFinite(classCount)) {
    return fallback;
  }

  return Math.max(2, Math.min(12, Math.round(classCount)));
};

const normalizeBreaks = (
  breaks: number[],
  minValue: number,
  maxValue: number,
): number[] => {
  if (breaks.length === 0) {
    return [minValue, maxValue];
  }

  const normalized = [...breaks];
  normalized[0] = minValue;
  normalized[normalized.length - 1] = maxValue;

  for (let index = 1; index < normalized.length; index += 1) {
    normalized[index] = Math.max(normalized[index], normalized[index - 1]);
  }

  return normalized;
};

const buildEqualIntervalBreaks = (
  minValue: number,
  maxValue: number,
  classCount: number,
): number[] => {
  const step = (maxValue - minValue) / classCount;
  const breaks = [minValue];

  for (let index = 1; index < classCount; index += 1) {
    breaks.push(minValue + step * index);
  }

  breaks.push(maxValue);
  return normalizeBreaks(breaks, minValue, maxValue);
};

const buildDefinedIntervalBreaks = (
  minValue: number,
  maxValue: number,
  definedInterval: number,
): number[] => {
  const interval =
    Number.isFinite(definedInterval) && definedInterval > 0
      ? definedInterval
      : defaultGradientDefinedInterval;
  const classCount = Math.max(1, Math.ceil((maxValue - minValue) / interval));
  const breaks = [minValue];

  for (let index = 1; index < classCount; index += 1) {
    breaks.push(minValue + interval * index);
  }

  breaks.push(maxValue);
  return normalizeBreaks(breaks, minValue, maxValue);
};

const buildQuantileBreaks = (
  values: number[],
  classCount: number,
): number[] => {
  const breaks = [values[0]];

  for (let index = 1; index < classCount; index += 1) {
    const valueIndex = Math.ceil((index * values.length) / classCount) - 1;
    breaks.push(values[Math.max(0, Math.min(valueIndex, values.length - 1))]);
  }

  breaks.push(values[values.length - 1]);
  return normalizeBreaks(breaks, values[0], values[values.length - 1]);
};

const buildNaturalBreaks = (values: number[], classCount: number): number[] => {
  const effectiveClassCount = Math.min(
    classCount,
    Math.max(1, new Set(values).size),
  );

  if (effectiveClassCount <= 1 || values.length <= 1) {
    return [values[0], values[values.length - 1]];
  }

  const lowerClassLimits = Array.from({ length: values.length + 1 }, () =>
    Array(effectiveClassCount + 1).fill(0),
  );
  const varianceCombinations = Array.from({ length: values.length + 1 }, () =>
    Array(effectiveClassCount + 1).fill(Number.POSITIVE_INFINITY),
  );

  for (let classIndex = 1; classIndex <= effectiveClassCount; classIndex += 1) {
    lowerClassLimits[1][classIndex] = 1;
    varianceCombinations[1][classIndex] = 0;
  }

  for (let valueCount = 2; valueCount <= values.length; valueCount += 1) {
    let sum = 0;
    let sumSquares = 0;
    let sampleCount = 0;

    for (let width = 1; width <= valueCount; width += 1) {
      const lowerIndex = valueCount - width + 1;
      const value = values[lowerIndex - 1];

      sampleCount += 1;
      sum += value;
      sumSquares += value * value;

      const variance = sumSquares - (sum * sum) / sampleCount;
      const previousIndex = lowerIndex - 1;

      if (previousIndex === 0) {
        continue;
      }

      for (
        let classIndex = 2;
        classIndex <= effectiveClassCount;
        classIndex += 1
      ) {
        const candidateVariance =
          variance + varianceCombinations[previousIndex][classIndex - 1];
        if (candidateVariance < varianceCombinations[valueCount][classIndex]) {
          lowerClassLimits[valueCount][classIndex] = lowerIndex;
          varianceCombinations[valueCount][classIndex] = candidateVariance;
        }
      }
    }

    lowerClassLimits[valueCount][1] = 1;
    varianceCombinations[valueCount][1] =
      sumSquares - (sum * sum) / sampleCount;
  }

  const breaks = Array(effectiveClassCount + 1).fill(0);
  breaks[0] = values[0];
  breaks[effectiveClassCount] = values[values.length - 1];

  let valueCount = values.length;
  for (let classIndex = effectiveClassCount; classIndex >= 2; classIndex -= 1) {
    const lowerIndex = lowerClassLimits[valueCount][classIndex];
    breaks[classIndex - 1] = values[Math.max(0, lowerIndex - 2)];
    valueCount = Math.max(1, lowerIndex - 1);
  }

  return normalizeBreaks(breaks, values[0], values[values.length - 1]);
};

export const getNumericColorBins = <T>(
  items: T[],
  getNumericValue: (item: T) => number | null | undefined,
  settings: NumericGradientClassificationSettings,
): NumericColorBins => {
  const values = getFiniteNumericValues(items, getNumericValue);

  if (values.length === 0) {
    return {
      minValue: null,
      maxValue: null,
      breaks: [],
      classCount: 0,
    };
  }

  const minValue = values[0];
  const maxValue = values[values.length - 1];
  if (minValue === maxValue) {
    return {
      minValue,
      maxValue,
      breaks: [minValue, maxValue],
      classCount: 1,
    };
  }

  const classCount = clampClassCount(
    settings.classCount,
    defaultGradientClassCount,
  );

  let breaks: number[];
  switch (settings.method) {
    case "natural-breaks":
      breaks = buildNaturalBreaks(values, classCount);
      break;
    case "quantile":
      breaks = buildQuantileBreaks(values, Math.min(classCount, values.length));
      break;
    case "defined-interval":
      breaks = buildDefinedIntervalBreaks(
        minValue,
        maxValue,
        settings.definedInterval,
      );
      break;
    case "equal-interval":
    default:
      breaks = buildEqualIntervalBreaks(minValue, maxValue, classCount);
      break;
  }

  return {
    minValue,
    maxValue,
    breaks,
    classCount: Math.max(1, breaks.length - 1),
  };
};

const getBinIndex = (value: number, bins: NumericColorBins): number => {
  if (bins.classCount <= 1) {
    return 0;
  }

  for (let index = 0; index < bins.classCount; index += 1) {
    const upperBound = bins.breaks[index + 1];
    if (index === bins.classCount - 1 || value <= upperBound) {
      return index;
    }
  }

  return bins.classCount - 1;
};

const sampleGradientAtPosition = (
  gradient: GradientLike,
  position: number,
): RGBAColor =>
  interpolateGradientColor(
    position,
    0,
    1,
    gradient.lowColor,
    gradient.highColor,
    gradient.middleColor,
  );

export const getGradientColorForValue = (
  value: number,
  bins: NumericColorBins,
  gradient: GradientLike,
): RGBAColor => {
  const classIndex = getBinIndex(value, bins);
  const position =
    bins.classCount <= 1 ? 0.5 : classIndex / Math.max(1, bins.classCount - 1);
  return sampleGradientAtPosition(gradient, position);
};

export const getGradientLegendClasses = (
  bins: NumericColorBins,
  gradient: GradientLike,
): GradientLegendClass[] => {
  if (bins.classCount <= 0 || bins.breaks.length < 2) {
    return [];
  }

  return Array.from({ length: bins.classCount }, (_, index) => ({
    key: `class-${index}`,
    lowValue: bins.breaks[index],
    highValue: bins.breaks[index + 1],
    color: sampleGradientAtPosition(
      gradient,
      bins.classCount <= 1 ? 0.5 : index / Math.max(1, bins.classCount - 1),
    ),
  }));
};

export const getNumericColorBinsSignature = (bins: NumericColorBins): string =>
  bins.breaks.map((value) => value.toPrecision(12)).join("|");
