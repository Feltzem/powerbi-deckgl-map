import test from "node:test";
import assert from "node:assert/strict";
import powerbi from "powerbi-visuals-api";

import {
  getDataViewSignature,
  getGroupedRoleColumns,
  isMeaningfulPrimitiveValue,
} from "../src/roleColumnUtils";

const makeColumn = (
  roleName: string,
  values: powerbi.PrimitiveValue[],
  displayName = roleName,
): powerbi.DataViewValueColumn => ({
  source: {
    displayName,
    roles: { [roleName]: true },
  },
  values,
});

const makeGroupedValues = (
  groups: powerbi.DataViewValueColumnGroup[],
  source?: powerbi.DataViewMetadataColumn,
): powerbi.DataViewValueColumns => {
  const values = [] as unknown as powerbi.DataViewValueColumns;
  values.source = source;
  values.grouped = () => groups;
  return values;
};

test("getGroupedRoleColumns merges grouped numeric values with a supplied merger", () => {
  const groupedValues = makeGroupedValues([
    { name: "sealed", values: [makeColumn("color", [4, 2])] },
    { name: "unsealed", values: [makeColumn("color", [6, 2])] },
  ]);

  const result = getGroupedRoleColumns(
    groupedValues,
    2,
    [["color", "color"]],
    (_roleKey, value) => typeof value === "number",
    (_roleKey, values) => {
      const numbers = values.filter(
        (value): value is number => typeof value === "number",
      );
      const firstValue = numbers[0];
      return numbers.every((value) => value === firstValue)
        ? firstValue
        : numbers.reduce((sum, value) => sum + value, 0);
    },
  );

  assert.equal(result.length, 1);
  assert.deepEqual(result[0].values, [10, 2]);
});

test("getGroupedRoleColumns uses the first meaningful grouped value by default", () => {
  const groupedValues = makeGroupedValues([
    { name: "first", values: [makeColumn("label", [null, "alpha"])] },
    { name: "second", values: [makeColumn("label", ["beta", "ignored"])] },
  ]);

  const result = getGroupedRoleColumns(
    groupedValues,
    2,
    [["label", "label"]],
    (_roleKey, value) => isMeaningfulPrimitiveValue(value),
  );

  assert.equal(result.length, 1);
  assert.deepEqual(result[0].values, ["beta", "alpha"]);
});

test("getGroupedRoleColumns derives series role values from group names", () => {
  const groupedValues = makeGroupedValues(
    [
      {
        name: "sealed",
        values: [{ source: { displayName: "value" }, values: [1, null] }],
      },
      {
        name: "metalled",
        values: [{ source: { displayName: "value" }, values: [null, 1] }],
      },
    ],
    {
      displayName: "surface",
      roles: { surface: true },
    },
  );

  const result = getGroupedRoleColumns(
    groupedValues,
    2,
    [["surface", "surface"]],
    (_roleKey, value) => isMeaningfulPrimitiveValue(value),
  );

  assert.equal(result.length, 1);
  assert.deepEqual(result[0].values, ["sealed", "metalled"]);
});

test("getGroupedRoleColumns prefers grouped series names over sparse role columns", () => {
  const groupedValues = makeGroupedValues(
    [
      {
        name: "sealed",
        values: [
          makeColumn("pathColor", ["sealed", null, null, null]),
          makeColumn("layerType", ["path", "path", null, null]),
        ],
      },
      {
        name: "metalled",
        values: [
          makeColumn("pathColor", [null, null, "metalled", null]),
          makeColumn("layerType", [null, null, "path", null]),
        ],
      },
      {
        name: "unmetalled",
        values: [
          makeColumn("pathColor", [null, null, null, null]),
          makeColumn("layerType", [null, null, null, "path"]),
        ],
      },
    ],
    {
      displayName: "road_surface",
      roles: { pathColor: true },
    },
  );

  const result = getGroupedRoleColumns(
    groupedValues,
    4,
    [["pathColor", "pathColor"]],
    (_roleKey, value) => isMeaningfulPrimitiveValue(value),
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].source.displayName, "road_surface");
  assert.deepEqual(result[0].values, [
    "sealed",
    "sealed",
    "metalled",
    "unmetalled",
  ]);
});

const makeCategoryColumn = (
  roleName: string,
  values: powerbi.PrimitiveValue[],
  displayName = roleName,
): powerbi.DataViewCategoryColumn => ({
  source: { displayName, queryName: displayName, roles: { [roleName]: true } },
  values,
});

const makeDataView = (
  categories: powerbi.DataViewCategoryColumn[],
  values: powerbi.DataViewValueColumn[],
): powerbi.DataView =>
  ({
    categorical: {
      categories,
      values: values as unknown as powerbi.DataViewValueColumns,
    },
    metadata: { columns: [] },
  }) as unknown as powerbi.DataView;

test("getDataViewSignature changes when a timestamp arrives as an extra category", () => {
  const geometryId = makeCategoryColumn(
    "geometryId",
    ["a", "b", "c"],
    "geometry_id",
  );
  const layerType = makeColumn("layerType", ["scatter", "scatter", "scatter"]);

  // Before: only geometry_id + layerType bound.
  const before = getDataViewSignature(makeDataView([geometryId], [layerType]));

  // After: a datetime is dragged onto Timestamp and Power BI delivers it as a
  // second category column (not a value). The signature must differ so the
  // dataset is re-parsed and the time domain is populated.
  const timestamp = makeCategoryColumn(
    "timestamp",
    [1000, 2000, 3000],
    "event_time",
  );
  const after = getDataViewSignature(
    makeDataView([geometryId, timestamp], [layerType]),
  );

  assert.notEqual(before, after);
});

test("getDataViewSignature is stable for identical data views", () => {
  const cat = makeCategoryColumn("geometryId", ["a", "b"], "geometry_id");
  const val = makeColumn("layerType", ["scatter", "scatter"]);
  assert.equal(
    getDataViewSignature(makeDataView([cat], [val])),
    getDataViewSignature(makeDataView([cat], [val])),
  );
});
