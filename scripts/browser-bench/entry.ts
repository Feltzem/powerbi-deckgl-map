// Browser benchmark for worker geometry decoding. Bundled and run in headless Chromium by
// scripts/browser-bench/run.cjs, so it uses real Blob-URL workers and the real WKP Wasm, as Power BI does.
import powerbi from "powerbi-visuals-api";
(globalThis as unknown as { powerbi: unknown }).powerbi = { visuals: { ValidatorType: { Min: "Min", Max: "Max" } } };

import { createWkp } from "@wkpjs/web";
import { collectGeometryToDecode, createDatasetSnapshot, storeDecodedGeometry } from "../../src/mapper";
import { VisualFormattingSettingsModel } from "../../src/settings";
import { getWkpWasmBytes } from "../../src/encoding";
import { defaultPoolSize, GeometryWorkerPool } from "../../src/geometryWorkerPool";

type Columns = Record<string, unknown[]>;
const host = {
  displayWarningIcon: () => undefined,
  createSelectionIdBuilder: () => ({
    withCategory: (_c: unknown, i: number) => ({ createSelectionId: () => ({ getKey: () => `s${i}` }) }),
  }),
} as unknown as powerbi.extensibility.visual.IVisualHost;

const view = (cols: Columns, n: number) => {
  const col = (role: string) => ({ source: { displayName: role, queryName: role, roles: { [role]: true } }, values: cols[role].slice(0, n) });
  const values = Object.keys(cols).filter((k) => k !== "geometryId").map(col) as unknown as powerbi.DataViewValueColumns;
  values.grouped = () => [];
  return {
    operationKind: 0,
    dataViews: [{ categorical: { categories: [{ source: { displayName: "id", queryName: "id", roles: { geometryId: true } }, values: cols.geometryId.slice(0, n) }], values }, metadata: {} }],
  } as unknown as powerbi.extensibility.visual.VisualUpdateOptions;
};

const line = (i: number, vertices: number): number[][] => {
  const lon = 175.2 + (i % 500) * 1e-3;
  const lat = -37.7 - Math.floor(i / 500) * 1e-3;
  return Array.from({ length: vertices }, (_, v) => [+(lon + v * 1e-4).toFixed(6), +(lat + Math.sin(v) * 1e-4).toFixed(6)]);
};

const summary = (s: ReturnType<typeof createDatasetSnapshot>) =>
  JSON.stringify([s.bounds, s.layers.all.map((d) => [d.id, d.type, d.pathData, d.polygonData])]);

async function run(rows: number, vertices: number, segment: number) {
  const wkp = await createWkp({ wasmBinary: getWkpWasmBytes() });
  const ctx = new wkp.Context();
  await new Promise((r) => setTimeout(r, 100)); // src/encoding.ts initialises its own WKP instance asynchronously
  const ids = Array.from({ length: rows }, (_, i) => `g${i}`);
  const lines = ids.map((_, i) => line(i, vertices));
  const datasets: Array<[string, Columns]> = [
    [`WKT path, ${vertices} vertices`, { geometryId: ids, layerType: ids.map(() => "path"), wkt: lines.map((l) => `LINESTRING (${l.map((p) => p.join(" ")).join(", ")})`) }],
    [`WKP path, ${vertices} vertices`, { geometryId: ids, layerType: ids.map(() => "path"), wkp: lines.map((l) => wkp.encode(ctx, { type: "LineString", coordinates: l }, 6)) }],
    [`WKP multipolygon`, {
      geometryId: ids, layerType: ids.map(() => "polygon"),
      wkp: lines.map((l) => {
        const ring = [...l.slice(0, 6), l[0]];
        const hole = ring.map(([x, y]) => [+(x + 1e-5).toFixed(6), +(y - 1e-5).toFixed(6)]);
        return wkp.encode(ctx, { type: "MultiPolygon", coordinates: [[ring, hole], [ring.map(([x, y]) => [+(x + 0.01).toFixed(6), y])]] }, 6);
      }),
    }],
  ];
  const settings = new VisualFormattingSettingsModel();
  const pool = new GeometryWorkerPool({ size: defaultPoolSize(), wasm: getWkpWasmBytes() });
  const results = [];
  for (const [name, cols] of datasets) {
    // Main thread only (before): the whole parse blocks the page.
    let t = performance.now();
    const plain = createDatasetSnapshot(view(cols, rows), settings, host, new Map(), "1");
    const mainOnly = performance.now() - t;

    // Workers (after), loading in fetchMoreData-sized segments like Power BI does.
    const cache = new Map();
    let blocked = 0;
    const phases = { collect: 0, unpack: 0, snapshot: 0 };
    let snapshot: ReturnType<typeof createDatasetSnapshot> | null = null;
    t = performance.now();
    for (let n = Math.min(segment, rows); ; n = Math.min(n + segment, rows)) {
      const options = view(cols, n);
      let s = performance.now();
      const request = collectGeometryToDecode(options, settings, cache, snapshot);
      phases.collect += performance.now() - s;
      const chunks = await pool.decode(request.encodings, request.values);
      s = performance.now();
      storeDecodedGeometry(cache, request.keys, chunks);
      phases.unpack += performance.now() - s;
      s = performance.now();
      snapshot = createDatasetSnapshot(options, settings, host, cache, "1", snapshot ? { previous: snapshot, final: n === rows } : null);
      phases.snapshot += performance.now() - s;
      blocked = phases.collect + phases.unpack + phases.snapshot;
      if (n === rows) break;
    }
    const withWorkers = performance.now() - t;
    results.push({
      name,
      rows,
      workers: defaultPoolSize(),
      mainOnlyMs: Math.round(mainOnly),
      workersTotalMs: Math.round(withWorkers),
      workersMainThreadMs: Math.round(blocked),
      identical: summary(plain) === summary(snapshot!),
      paths: snapshot!.layers.path.length + snapshot!.layers.polygon.length,
      phases: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, Math.round(v)])),
    });
  }
  pool.destroy();
  return results;
}

(window as unknown as { runBench: typeof run }).runBench = run;
