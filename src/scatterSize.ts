/**
 * How the Scatter radius field is turned into an on-screen point size.
 *
 * - "meters": the field is a ground distance in metres (deck.gl's default
 *   units), clamped by "Point radius min/max (pixels)". Right when the value
 *   really is a distance, e.g. a buffer radius.
 * - "scale": the field is an arbitrary measure (count, amount, score) and is
 *   rescaled from its data range onto "Min/Max size (pixels)", like a Power BI
 *   bubble map. Without this, typical measures (say 1-100) are a fraction of a
 *   pixel in metres and all clamp to the same minimum size.
 */
export type ScatterRadiusMode = "meters" | "scale";
export type ScatterSizeScaleType = "area" | "linear";

export const defaultScatterRadiusMode: ScatterRadiusMode = "meters";
export const defaultScatterSizeScaleType: ScatterSizeScaleType = "area";

export const scatterRadiusModeItems: Array<{
  value: ScatterRadiusMode;
  displayName: string;
}> = [
  { value: "meters", displayName: "Metres" },
  { value: "scale", displayName: "Scale to size range" },
];

export const scatterSizeScaleTypeItems: Array<{
  value: ScatterSizeScaleType;
  displayName: string;
}> = [
  { value: "area", displayName: "Area (square root)" },
  { value: "linear", displayName: "Linear" },
];

const readEnumValue = (raw: unknown): unknown =>
  raw && typeof raw === "object" && "value" in raw
    ? (raw as { value: unknown }).value
    : raw;

export const getScatterRadiusMode = (raw: unknown): ScatterRadiusMode =>
  readEnumValue(raw) === "scale" ? "scale" : "meters";

export const getScatterSizeScaleType = (raw: unknown): ScatterSizeScaleType =>
  readEnumValue(raw) === "linear" ? "linear" : "area";

export interface ScatterSizeScale {
  min: number;
  max: number;
  minPixels: number;
  maxPixels: number;
  scaleType: ScatterSizeScaleType;
}

/** Data range of the finite radius values, or null when there are none. */
export const getRadiusDomain = <T>(
  items: readonly T[],
  getValue: (item: T) => number | null | undefined,
): { min: number; max: number } | null => {
  let min = Infinity;
  let max = -Infinity;
  for (const item of items) {
    const value = getValue(item);
    if (typeof value === "number" && Number.isFinite(value)) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  return min <= max ? { min, max } : null;
};

/**
 * Pixel radius for a value. Missing values get the minimum size; when every
 * value is the same, points sit at the middle of the size range.
 */
export const scaleRadiusToPixels = (
  value: number | null | undefined,
  scale: ScatterSizeScale,
): number => {
  const lo = Math.max(0, Math.min(scale.minPixels, scale.maxPixels));
  const hi = Math.max(0, Math.max(scale.minPixels, scale.maxPixels));
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return lo;
  }
  const span = scale.max - scale.min;
  let t = span > 0 ? (value - scale.min) / span : 0.5;
  t = Math.max(0, Math.min(1, t));
  if (scale.scaleType === "area") {
    t = Math.sqrt(t);
  }
  return lo + t * (hi - lo);
};
