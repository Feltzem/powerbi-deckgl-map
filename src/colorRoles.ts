import {
  ColorRoleKey,
  ColorRoleStats,
  ColorRoleStatsStore,
} from "./dataTypes";

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
  minValue: null,
  maxValue: null,
});

export const createEmptyColorRoleStatsStore = (): ColorRoleStatsStore =>
  Object.fromEntries(
    colorRoleKeys.map((roleKey) => [roleKey, createEmptyColorRoleStats()]),
  ) as ColorRoleStatsStore;

export const updateColorRoleStats = (
  store: ColorRoleStatsStore,
  roleKey: ColorRoleKey,
  textColor: string | null | undefined,
  numericValue: number | null | undefined,
) => {
  const stats = store[roleKey];
  if (typeof textColor === "string" && textColor.trim().length > 0) {
    stats.hasTextColor = true;
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
