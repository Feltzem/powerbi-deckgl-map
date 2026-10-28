// Where does dataset parsing spend its time? Times createDatasetSnapshot on synthetic Power BI data views,
// one shot and in 30k-row fetchMoreData segments, for scatter (lat/lon) and WKT paths. WKP only runs in the browser bundle.
//   node --import tsx scripts/bench-parse-phases.ts [scatterRows] [pathRows] [verticesPerPath]
import powerbi from "powerbi-visuals-api";
(globalThis as unknown as { powerbi: unknown }).powerbi = { visuals: { ValidatorType: { Min: "Min", Max: "Max" } } };

const [scatterRows, pathRows, verticesPerPath] = [1_048_576, 100_000, 20].map((d, i) => Number(process.argv[2 + i] ?? d));
const host = {
  displayWarningIcon: () => undefined,
  createSelectionIdBuilder: () => ({
    withCategory: (_c: unknown, i: number) => ({ createSelectionId: () => ({ getKey: () => `s${i}` }) }),
  }),
} as unknown as powerbi.extensibility.visual.IVisualHost;

type Columns = Record<string, unknown[]>;
const view = (cols: Columns, n: number) => {
  const col = (role: string) => ({ source: { displayName: role, queryName: role, roles: { [role]: true } }, values: cols[role].slice(0, n) });
  const values = Object.keys(cols).filter((k) => k !== "geometryId").map(col) as unknown as powerbi.DataViewValueColumns;
  values.grouped = () => [];
  return { dataViews: [{ categorical: { categories: [{ source: { displayName: "id", queryName: "id", roles: { geometryId: true } }, values: cols.geometryId.slice(0, n) }], values }, metadata: {} }] } as unknown as powerbi.extensibility.visual.VisualUpdateOptions;
};

function line(i: number): number[][] {
  const lon = 175.2 + (i % 500) * 1e-3, lat = -37.7 - Math.floor(i / 500) * 1e-3;
  return Array.from({ length: verticesPerPath }, (_, v) => [lon + v * 1e-4, lat + Math.sin(v) * 1e-4]);
}

async function main() {
  const { createDatasetSnapshot } = await import("../src/mapper");
  const { VisualFormattingSettingsModel } = await import("../src/settings");
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `g${i}`);
  const datasets: Array<[string, Columns]> = [
    ["scatter lat/lon", {
      geometryId: ids(scatterRows), layerType: Array(scatterRows).fill("scatter"),
      point1Latitude: ids(scatterRows).map((_, i) => -37.7 - (i % 1000) * 1e-4),
      point1Longitude: ids(scatterRows).map((_, i) => 175.2 + Math.floor(i / 1000) * 1e-4),
    }],
    [`path WKT (${verticesPerPath} vertices)`, {
      geometryId: ids(pathRows), layerType: Array(pathRows).fill("path"),
      wkt: ids(pathRows).map((_, i) => `LINESTRING (${line(i).map((p) => p.join(" ")).join(", ")})`),
    }],
  ];
  const settings = new VisualFormattingSettingsModel();
  for (const [name, cols] of datasets) {
    const total = cols.geometryId.length;
    let t = performance.now();
    createDatasetSnapshot(view(cols, total), settings, host, new Map(), "1");
    const oneShot = performance.now() - t;
    t = performance.now();
    let snapshot = null;
    for (let n = Math.min(30_000, total); ; n = Math.min(n + 30_000, total)) {
      snapshot = createDatasetSnapshot(view(cols, n), settings, host, new Map(), "1", snapshot ? { previous: snapshot, final: n === total } : null);
      if (n === total) break;
    }
    const segmented = performance.now() - t;
    console.log(`${name.padEnd(26)} ${total.toLocaleString().padStart(9)} rows: one shot ${(oneShot / 1000).toFixed(2)} s, ` +
      `30k segments ${(segmented / 1000).toFixed(2)} s, ${((oneShot * 1000) / total).toFixed(1)} µs/row`);
  }
}
main();
