// Times a 1,048,576-row scatter load arriving in 30,000-row fetchMoreData segments, parsed incrementally
// (only new rows each segment) versus from scratch each segment (the behaviour before Phase 1).
//   node --import tsx scripts/bench-segmented-load.ts [totalRows]
import powerbi from "powerbi-visuals-api";
(globalThis as unknown as { powerbi: unknown }).powerbi = { visuals: { ValidatorType: { Min: "Min", Max: "Max" } } };
const { createDatasetSnapshot } = require("../src/mapper") as typeof import("../src/mapper");
const { VisualFormattingSettingsModel } = require("../src/settings") as typeof import("../src/settings");

const total = Number(process.argv[2] ?? 1_048_576);
const host = {
  displayWarningIcon: () => undefined,
  createSelectionIdBuilder: () => ({
    withCategory: (_c: unknown, i: number) => ({ createSelectionId: () => ({ getKey: () => `s${i}` }) }),
  }),
} as unknown as powerbi.extensibility.visual.IVisualHost;
const ids = Array.from({ length: total }, (_, i) => `p${i}`);
const lat = ids.map((_, i) => -37.7 - (i % 1000) * 1e-4);
const lon = ids.map((_, i) => 175.2 + Math.floor(i / 1000) * 1e-4);
const options = (n: number) => {
  const col = (role: string, values: unknown[]) => ({ source: { displayName: role, queryName: role, roles: { [role]: true } }, values: values.slice(0, n) });
  const values = [col("layerType", ids.map(() => "scatter")), col("point1Latitude", lat), col("point1Longitude", lon)] as unknown as powerbi.DataViewValueColumns;
  values.grouped = () => [];
  return { dataViews: [{ categorical: { categories: [{ source: { displayName: "id", queryName: "id", roles: { geometryId: true } }, values: ids.slice(0, n) }], values }, metadata: {} }] } as unknown as powerbi.extensibility.visual.VisualUpdateOptions;
};
const settings = new VisualFormattingSettingsModel();
for (const mode of ["incremental", "full re-parse"]) {
  const t = performance.now();
  let snapshot = null;
  let segments = 0;
  for (let n = Math.min(30_000, total); ; n = Math.min(n + 30_000, total)) {
    const append = mode === "incremental" && snapshot ? { previous: snapshot, final: n === total } : null;
    snapshot = createDatasetSnapshot(options(n), settings, host, new Map(), "1", append);
    segments += 1;
    if (n === total) break;
  }
  console.log(`${mode.padEnd(14)} ${total.toLocaleString()} rows in ${segments} segments: ${((performance.now() - t) / 1000).toFixed(1)} s`);
}
