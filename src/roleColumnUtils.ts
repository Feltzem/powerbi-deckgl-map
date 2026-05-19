import powerbi from "powerbi-visuals-api";

export type RoleColumn =
  | powerbi.DataViewValueColumn
  | powerbi.DataViewCategoryColumn;

export const isMeaningfulPrimitiveValue = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return true;
};

export const getRoleRowCount = (
  values: powerbi.DataViewValueColumns | null | undefined,
  categories: powerbi.DataViewCategoryColumn[] = [],
): number => {
  const categoryRowCount = categories[0]?.values?.length;
  if (typeof categoryRowCount === "number") {
    return categoryRowCount;
  }

  const valueRowCount = values?.[0]?.values?.length;
  return typeof valueRowCount === "number" ? valueRowCount : 0;
};

const getGroupedValueColumnGroups = (
  values: powerbi.DataViewValueColumns | null | undefined,
): powerbi.DataViewValueColumnGroup[] => {
  if (!values || typeof values.grouped !== "function") {
    return [];
  }

  try {
    return values.grouped() ?? [];
  } catch {
    return [];
  }
};

const rowBelongsToGroupedValue = (
  group: powerbi.DataViewValueColumnGroup,
  index: number,
): boolean =>
  group.values.some((column) => isMeaningfulPrimitiveValue(column.values?.[index]));

export const getGroupedRoleColumns = <TRoleKey extends string>(
  values: powerbi.DataViewValueColumns | null | undefined,
  rowCount: number,
  roleMappings: Array<[TRoleKey, string]>,
  hasMeaningfulRoleValue: (
    roleKey: TRoleKey,
    value: powerbi.PrimitiveValue | null | undefined,
  ) => boolean,
): powerbi.DataViewValueColumn[] => {
  const groups = getGroupedValueColumnGroups(values);
  if (!values || rowCount === 0 || groups.length === 0) {
    return [];
  }

  const groupedRoleColumns: powerbi.DataViewValueColumn[] = [];
  for (const [roleKey, roleName] of roleMappings) {
    const sourceColumns = groups.flatMap((group) =>
      group.values.filter((column) => column.source?.roles?.[roleName]),
    );
    if (sourceColumns.length > 0) {
      const mergedValues = new Array<powerbi.PrimitiveValue | null>(rowCount).fill(
        null,
      );
      for (const group of groups) {
        for (const column of group.values) {
          if (!column.source?.roles?.[roleName]) {
            continue;
          }
          for (let index = 0; index < rowCount; index += 1) {
            const value = column.values?.[index] ?? null;
            if (
              !hasMeaningfulRoleValue(roleKey, mergedValues[index]) &&
              hasMeaningfulRoleValue(roleKey, value)
            ) {
              mergedValues[index] = value;
            }
          }
        }
      }

      if (mergedValues.some((value) => hasMeaningfulRoleValue(roleKey, value))) {
        groupedRoleColumns.push({
          source: sourceColumns[0].source,
          values: mergedValues,
        });
      }
    }

    const seriesSource = values.source;
    if (!seriesSource?.roles?.[roleName]) {
      continue;
    }

    const seriesValues = new Array<powerbi.PrimitiveValue | null>(rowCount).fill(
      null,
    );
    for (const group of groups) {
      const groupName = group.name ?? null;
      if (!hasMeaningfulRoleValue(roleKey, groupName)) {
        continue;
      }

      for (let index = 0; index < rowCount; index += 1) {
        if (
          !hasMeaningfulRoleValue(roleKey, seriesValues[index]) &&
          rowBelongsToGroupedValue(group, index)
        ) {
          seriesValues[index] = groupName;
        }
      }
    }

    if (seriesValues.some((value) => hasMeaningfulRoleValue(roleKey, value))) {
      groupedRoleColumns.push({
        source: seriesSource,
        values: seriesValues,
      });
    }
  }

  return groupedRoleColumns;
};
