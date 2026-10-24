import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import powerbi from "powerbi-visuals-api";

import { createDatasetSnapshot } from "../src/mapper";
import { checkLoadBudget } from "../src/loadBudget";
import { VisualFormattingSettingsModel } from "../src/settings";

(globalThis as unknown as { powerbi: unknown }).powerbi = {
  visuals: { ValidatorType: { Min: "Min", Max: "Max" } },
};

const host = {
  displayWarningIcon: () => undefined,
  createSelectionIdBuilder: () => ({
    withCategory: (_c: unknown, index: number) => ({
      createSelectionId: () => ({ getKey: () => `selection-${index}` }),
    }),
  }),
} as unknown as powerbi.extensibility.visual.IVisualHost;

function column(role: string, values: powerbi.PrimitiveValue[], queryName = role): powerbi.DataViewValueColumn {
  return { source: { displayName: role, queryName, roles: { [role]: true } }, values };
}

// Power BI's aggregate segments: each Append update carries every row loaded so far.
function optionsForRows(count: number, latitudeQuery = "point1Latitude") {
  const ids = Array.from({ length: count }, (_, i) => `p${i}`);
  const values = [
    column("layerType", ids.map((_, i) => (i % 3 === 0 ? "path" : "scatter"))),
    column("point1Latitude", ids.map((_, i) => -37.8 - i * 0.001), latitudeQuery),
    column("point1Longitude", ids.map((_, i) => 175 + i * 0.001)),
    column("wkt", ids.map((_, i) => (i % 3 === 0 ? `LINESTRING (175 ${-37.8 - i * 0.001}, 175.01 -37.7)` : null))),
  ] as unknown as powerbi.DataViewValueColumns;
  values.grouped = () => [];
  return {
    dataViews: [
      {
        categorical: {
          categories: [{ source: { displayName: "id", queryName: "id", roles: { geometryId: true } }, values: ids }],
          values,
        },
        metadata: {},
      },
    ],
  } as unknown as powerbi.extensibility.visual.VisualUpdateOptions;
}

const summary = (snapshot: ReturnType<typeof createDatasetSnapshot>) => ({
  ids: snapshot.layers.all.map((item) => item.id),
  scatter: snapshot.layers.scatter.length,
  path: snapshot.layers.path.length,
  bounds: snapshot.bounds,
  parsedRowCount: snapshot.parsedRowCount,
});

test("segmented loads parse only new rows and end equal to a full parse", () => {
  const settings = new VisualFormattingSettingsModel();
  const cache = new Map();
  let snapshot = createDatasetSnapshot(optionsForRows(4), settings, host, cache, "1");
  const firstRow = snapshot.layers.all[0];
  for (const [rows, final] of [[9, false], [15, true]] as const) {
    snapshot = createDatasetSnapshot(optionsForRows(rows), settings, host, cache, "1", { previous: snapshot, final });
  }
  const full = createDatasetSnapshot(optionsForRows(15), settings, host, new Map(), "1");
  assert.deepEqual(summary(snapshot), summary(full));
  assert.equal(snapshot.layers.all[0], firstRow, "earlier rows are carried over, not re-parsed");
});

test("a changed field binding forces a full parse", () => {
  const settings = new VisualFormattingSettingsModel();
  const previous = createDatasetSnapshot(optionsForRows(4), settings, host, new Map(), "1");
  const next = createDatasetSnapshot(optionsForRows(6, "OtherTable.lat"), settings, host, new Map(), "1", {
    previous,
    final: true,
  });
  assert.notEqual(next.parseKey, previous.parseKey);
  assert.notEqual(next.layers.all[0], previous.layers.all[0]);
  assert.equal(next.parsedRowCount, 6);
});

test("load budget stops at the row cap or the memory budget", () => {
  const base = { maxRows: 100_000, heapBytes: null, baselineHeapBytes: null, budgetMb: 400 };
  assert.equal(checkLoadBudget({ ...base, rows: 60_000 }).stop, false);
  assert.equal(checkLoadBudget({ ...base, rows: 100_000 }).reason, "rows");
  const memory = checkLoadBudget({ ...base, rows: 60_000, heapBytes: 600e6, baselineHeapBytes: 100e6 });
  assert.equal(memory.reason, "memory");
  assert.match(memory.message ?? "", /500 MB/);
  assert.equal(checkLoadBudget({ ...base, rows: 60_000, heapBytes: 300e6, baselineHeapBytes: 100e6 }).stop, false);
});

test("data loading settings are declared in capabilities with the 30k window", () => {
  const capabilities = JSON.parse(readFileSync(new URL("../capabilities.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(capabilities.objects.dataLoadingProps.properties).sort(), ["maxRows", "memoryBudgetMb"]);
  const windows = JSON.stringify(capabilities.dataViewMappings).match(/"window":\{"count":(\d+)\}/g) ?? [];
  assert.ok(windows.length > 0 && windows.every((w) => w.includes("30000")));
});
