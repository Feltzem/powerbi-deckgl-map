import {
  ColorRoleKey,
  ColorRoleStats,
  ColorRoleStatsStore,
} from "./dataTypes";
import { RGBAColor } from "./col";

export const colorRoleKeys: ColorRoleKey[] = [
  "scatterFillColor",
  "scatterLineColor",
  "lineLineColor",
  "pathColor",
  "polygonFillColor",
  "polygonLineColor",
  "arcSourceColor",
  "arcTargetColor",
];

export const createEmptyColorRoleStats = (): ColorRoleStats => ({
  hasTextColor: false,
  hasNumericColor: false,
  hasCategoricalColor: false,
  minValue: null,
  maxValue: null,
  categoryCounts: new Map<string, number>(),
  categoryOrder: [],
});

export const createEmptyColorRoleStatsStore = (): ColorRoleStatsStore =>
  Object.fromEntries(
    colorRoleKeys.map((roleKey) => [roleKey, createEmptyColorRoleStats()]),
  ) as ColorRoleStatsStore;

export const updateColorRoleStats = (
  store: ColorRoleStatsStore,
  roleKey: ColorRoleKey,
  textColor: RGBAColor | null | undefined,
  numericValue: number | null | undefined,
  categoricalValue: string | null | undefined,
) => {
  const stats = store[roleKey];
  if (textColor) {
    stats.hasTextColor = true;
  }

  if (categoricalValue) {
    stats.hasCategoricalColor = true;
    if (!stats.categoryCounts.has(categoricalValue)) {
      stats.categoryOrder.push(categoricalValue);
    }
    stats.categoryCounts.set(
      categoricalValue,
      (stats.categoryCounts.get(categoricalValue) ?? 0) + 1,
    );
  }

  if (typeof numericValue !== "number" || !isFinite(numericValue)) {
    return;
  }

  stats.hasNumericColor = true;
  stats.minValue =
    stats.minValue === null ? numericValue : Math.min(stats.minValue, numericValue);
  stats.maxValue =
    stats.maxValue === null ? numericValue : Math.max(stats.maxValue, numericValue);
};

export const getColorRoleCategorySignature = (
  stats: ColorRoleStats,
): string =>
  stats.categoryOrder
    .map((category) => `${category}:${stats.categoryCounts.get(category) ?? 0}`)
    .join("|");
