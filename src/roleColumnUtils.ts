import powerbi from "powerbi-visuals-api";

export type RoleColumn =
  | powerbi.DataViewValueColumn
  | powerbi.DataViewCategoryColumn;

export type GroupedRoleValueMerger<TRoleKey extends string> = (
  roleKey: TRoleKey,
  values: powerbi.PrimitiveValue[],
) => powerbi.PrimitiveValue | null | undefined;

/**
 * A stable signature of a categorical data view, used to decide whether the
 * dataset must be re-parsed. It signs every category AND value column's
 * identity and bound roles, plus a few sampled values, so that binding a field
 * to a new role (e.g. dragging a datetime onto the Timestamp role, which Power
 * BI may deliver as an extra category rather than a value) changes the
 * signature and triggers a re-parse. Signing only the first category would miss
 * that and leave derived state (e.g. the animation time domain) stale.
 */
export const getDataViewSignature = (dataView: powerbi.DataView): string => {
  const categorical = dataView.categorical;
  const categories = categorical?.categories ?? [];
  const values = categorical?.values ?? [];
  const rowCount = categories[0]?.values?.length ?? 0;
  const sampleIndexes =
    rowCount > 0 ? [0, Math.floor(rowCount / 2), rowCount - 1] : [];

  const columnSignature = (column: RoleColumn): string => {
    const roleSignature = Object.entries(column.source?.roles ?? {})
      .filter(([, enabled]) => enabled)
      .map(([role]) => role)
      .sort()
      .join(",");
    const columnValues = column.values;
    const samples = sampleIndexes
      .map((index) => String(columnValues?.[index] ?? ""))
      .join(",");
    return `${column.source?.queryName ?? column.source?.displayName}:${roleSignature}:${columnValues?.length ?? 0}:${samples}`;
  };

  const categorySignature = categories.map(columnSignature).join(";");
  const valueSignature = (values as unknown as RoleColumn[])
    .map(columnSignature)
    .join(";");

  return [
    rowCount,
    categorySignature,
    valueSignature,
    dataView.metadata?.segment ? "segmented" : "complete",
    (dataView.metadata as { isDataFilterApplied?: boolean })
      ?.isDataFilterApplied
      ? "filtered"
      : "unfiltered",
  ].join("::");
};

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
  mergeGroupedRoleValues?: GroupedRoleValueMerger<TRoleKey>,
): powerbi.DataViewValueColumn[] => {
  const groups = getGroupedValueColumnGroups(values);
  if (!values || rowCount === 0 || groups.length === 0) {
    return [];
  }

  const groupedRoleColumns: powerbi.DataViewValueColumn[] = [];
  for (const [roleKey, roleName] of roleMappings) {
    const seriesSource = values.source;
    if (seriesSource?.roles?.[roleName]) {
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
        continue;
      }
    }

    const sourceColumns = groups.flatMap((group) =>
      group.values.filter((column) => column.source?.roles?.[roleName]),
    );
    if (sourceColumns.length > 0) {
      const groupedValues = Array.from(
        { length: rowCount },
        () => [] as powerbi.PrimitiveValue[],
      );
      for (const group of groups) {
        for (const column of group.values) {
          if (!column.source?.roles?.[roleName]) {
            continue;
          }
          for (let index = 0; index < rowCount; index += 1) {
            const value = column.values?.[index] ?? null;
            if (hasMeaningfulRoleValue(roleKey, value)) {
              groupedValues[index].push(value);
            }
          }
        }
      }

      const mergedValues = groupedValues.map((rowValues) => {
        if (rowValues.length === 0) {
          return null;
        }

        return mergeGroupedRoleValues?.(roleKey, rowValues) ?? rowValues[0];
      });

      if (mergedValues.some((value) => hasMeaningfulRoleValue(roleKey, value))) {
        groupedRoleColumns.push({
          source: sourceColumns[0].source,
          values: mergedValues,
        });
      }
    }
  }

  return groupedRoleColumns;
};
