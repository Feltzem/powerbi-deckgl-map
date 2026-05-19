import powerbi from "powerbi-visuals-api";
import { parseColorString, RGBAColor } from "./col";

const strictNumberPattern = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

export interface ParsedColorInput {
  rgbaColor: RGBAColor | null;
  numericValue: number | null;
  categoricalValue: string | null;
}

export const getNumberFromPrimitive = (
  value: powerbi.PrimitiveValue,
): number | null => {
  if (value === null) {
    return null;
  }
  const num = parseFloat(value.toString());
  return Number.isNaN(num) ? null : num;
};

export const getNumberFromValue = (
  col: powerbi.PrimitiveValue | null,
): number | null => {
  if (col === null || col === undefined) {
    return null;
  }
  return getNumberFromPrimitive(col);
};

export const getStrictNumberFromPrimitive = (
  value: powerbi.PrimitiveValue,
): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "bigint") {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || !strictNumberPattern.test(trimmed)) {
    return null;
  }

  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
};

export const getStrictNumberFromValue = (
  col: powerbi.PrimitiveValue | null,
): number | null => {
  if (col === null || col === undefined) {
    return null;
  }
  return getStrictNumberFromPrimitive(col);
};

export const getHexColorString = (
  col: powerbi.PrimitiveValue | null,
): string | null => {
  if (col === null || col === undefined) {
    return null;
  }

  const trimmed = col
    .toString()
    .trim()
    .replace(/^(['"])(.*)\1$/, "$2");
  return /^#|^rgba?\(/i.test(trimmed) ? trimmed : null;
};

const getTrimmedTextValue = (
  col: powerbi.PrimitiveValue | null,
): string | null => {
  if (typeof col !== "string") {
    return null;
  }

  const trimmed = col
    .trim()
    .replace(/^(['"])(.*)\1$/, "$2")
    .trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const parseColorInput = (
  col: powerbi.PrimitiveValue | null,
): ParsedColorInput => {
  const textValue = getTrimmedTextValue(col);
  const rgbaColor = parseColorString(textValue);
  if (rgbaColor) {
    return {
      rgbaColor,
      numericValue: null,
      categoricalValue: null,
    };
  }

  const numericValue = getStrictNumberFromValue(col);
  if (numericValue !== null) {
    return {
      rgbaColor: null,
      numericValue,
      categoricalValue: null,
    };
  }

  return {
    rgbaColor: null,
    numericValue: null,
    categoricalValue: textValue,
  };
};
