import { decodeHex, RGBAColor, withOpacity } from "./col";

export interface CategoricalPaletteDefinition {
  displayName: string;
  colors: readonly string[];
}

export const categoricalPalettes = {
  modern: {
    displayName: "Modern",
    colors: [
      "#2563EB",
      "#16A34A",
      "#DC2626",
      "#9333EA",
      "#EA580C",
      "#0891B2",
      "#BE123C",
      "#4F46E5",
      "#65A30D",
      "#0D9488",
      "#C026D3",
      "#CA8A04",
    ],
  },
  dark: {
    displayName: "Dark",
    colors: [
      "#003F5C",
      "#7A1E48",
      "#1B6B3A",
      "#4B2E83",
      "#9A3412",
      "#155E75",
      "#7F1D1D",
      "#365314",
      "#1E3A8A",
      "#854D0E",
      "#5B21B6",
      "#115E59",
    ],
  },
  neon: {
    displayName: "Neon",
    colors: [
      "#00E5FF",
      "#FF3D81",
      "#7CFF00",
      "#FFD400",
      "#B026FF",
      "#FF6B00",
      "#00FFA3",
      "#FF4D4D",
      "#3D5AFE",
      "#F5FF00",
      "#00B8D9",
      "#FF00C7",
    ],
  },
} as const satisfies Record<string, CategoricalPaletteDefinition>;

export type CategoricalPaletteKey = keyof typeof categoricalPalettes;

export const defaultCategoricalPaletteKey: CategoricalPaletteKey = "modern";

const categoricalPaletteEntries = Object.entries(categoricalPalettes) as Array<
  [CategoricalPaletteKey, (typeof categoricalPalettes)[CategoricalPaletteKey]]
>;

export const categoricalPaletteItems = categoricalPaletteEntries.map(
  ([value, palette]) => ({
    value,
    displayName: palette.displayName,
  }),
);

export const getCategoricalPalette = (
  paletteKey: string | null | undefined,
): CategoricalPaletteDefinition => {
  if (paletteKey && paletteKey in categoricalPalettes) {
    return categoricalPalettes[paletteKey as CategoricalPaletteKey];
  }

  return categoricalPalettes[defaultCategoricalPaletteKey];
};

const hashCategory = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const getCategoricalPaletteColor = (
  category: string,
  paletteKey: string | null | undefined,
  opacity: number,
): RGBAColor => {
  const palette = getCategoricalPalette(paletteKey);
  const colors = palette.colors;
  const color = colors[hashCategory(category) % colors.length];
  return withOpacity(decodeHex(color, [0, 0, 0, 255]), opacity);
};
