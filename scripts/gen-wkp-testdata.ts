// One-off generator: emits a CSV of 3D WKP geometry + timestamps so the
// 3D-Z + time-animation feature can be exercised in Power BI.
//
// Run: node --import tsx scripts/gen-wkp-testdata.ts
//
// Output: samples/animation/wkp_time_animation_sample.csv
//
// Columns: geometry_id, layer_type, wkp, timestamp, scatter_fill,
//          polygon_fill, polygon_extrude_elevation, tooltip_html
//
// The encoder runs the same way as scripts/benchmarks/run.ts: read the embedded
// wasm binary and hand it to createWkp so the browser-only loader works in Node.

// The @wkpjs/web bundle embeds a browser-targeted wasm loader whose
// ENVIRONMENT_IS_NODE check (typeof process.versions.node === "string") makes
// it call require("fs"), which the bundle deliberately blocks. That check runs
// when wkp_core.js is first imported, so we mask process.versions.node to read
// as "not Node" and kick off the dynamic import BEFORE any other work. We keep
// `process` itself (node:fs needs it) and never restore the mask — nothing else
// in this one-off script depends on process.versions.node.
Object.defineProperty(process.versions, "node", {
  value: undefined,
  configurable: true,
});
(globalThis as { window?: unknown }).window = globalThis;
const wkpModulePromise = import("@wkpjs/web").then((mod) => mod.createWkp);

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const loadWkp = () => wkpModulePromise;

type CreateWkp = Awaited<typeof wkpModulePromise>;
type WkpModule = Awaited<ReturnType<CreateWkp>>;
type WkpContext = InstanceType<WkpModule["Context"]>;

const OUT_DIR = path.join(process.cwd(), "samples", "animation");
const OUT_FILE = path.join(OUT_DIR, "wkp_time_animation_sample.csv");

// Hamilton-ish anchor so the sample lands on the existing demo basemap area.
const ANCHOR_LON = 175.27;
const ANCHOR_LAT = -37.79;

// Short, fast-cycling time window so the trailing-window sweep is obvious:
// a 10-minute domain with a 2-minute trail means ~20% of points are visible at
// once, and at the default speed (60 sim-sec/real-sec) the whole sweep takes
// ~10 real seconds. The timestamp is still a real epoch so the tooltip shows a
// readable time.
const T0 = Math.floor(Date.parse("2026-06-15T08:00:00Z") / 1000);
const DURATION = 10 * 60; // 10 minutes of simulated time
// Scatter radius (metres) large enough to be clearly visible at city zoom.
const SCATTER_RADIUS_M = 80;

const csvEscape = (value: string | number): string => {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const createEncoder = async () => {
  const wasmPath = path.join(
    process.cwd(),
    "node_modules",
    "@wkpjs",
    "web",
    "dist",
    "wkp_core.wasm",
  );
  // Read the wasm while node:fs still works, then load the bundle with the
  // environment spoof in place.
  const wasmBinary = await readFile(wasmPath);
  const createWkp = await loadWkp();
  const wkp = await createWkp({ wasmBinary });
  const ctx: WkpContext = new wkp.Context();
  // Use a scalar precision (6 decimals on every dimension). The per-dimension
  // precision-array form of encode() in this @wkpjs/web version truncates
  // lon/lat to integers, so we keep the uniform scalar that round-trips
  // correctly for both the lon/lat and the metre-scale Z.
  const PRECISION = 6;
  return {
    line: (coords: [number, number, number][]): string =>
      wkp.encode(ctx, { type: "LineString", coordinates: coords }, PRECISION),
    polygon: (ring: [number, number, number][]): string =>
      wkp.encode(ctx, { type: "Polygon", coordinates: [ring] }, PRECISION),
  };
};

interface Row {
  geometry_id: string;
  layer_type: string;
  wkp: string;
  timestamp: number;
  scatter_radius: string;
  scatter_fill: string;
  polygon_fill: string;
  polygon_extrude_elevation: string;
  tooltip_html: string;
}

const main = async () => {
  const enc = await createEncoder();
  const rows: Row[] = [];

  // 1) A dense point cloud of scatter rows spread across the time domain. The
  //    visual derives their height from the timestamp (Max height), so these
  //    form the vertical "time rug" that sweeps as the trailing window slides.
  //    Scatter has no WKP; lat/lon come from separate point columns.
  const SCATTER_N = 200;
  const scatterRows: Array<{
    id: string;
    lat: number;
    lon: number;
    t: number;
    fill: string;
  }> = [];
  for (let i = 0; i < SCATTER_N; i += 1) {
    const frac = i / (SCATTER_N - 1);
    const t = T0 + Math.round(frac * DURATION);
    // A tight phyllotaxis spiral around the anchor so the rug reads as a column
    // of points rather than a sparse scatter.
    const angle = i * 2.399963; // golden angle
    const radius = 0.0016 * Math.sqrt(i);
    const lon = ANCHOR_LON + Math.cos(angle) * radius;
    const lat = ANCHOR_LAT + Math.sin(angle) * radius * 0.8;
    // Sequential fill (blue -> red) by time so the leading edge of the window
    // is visually distinct as it sweeps.
    const r = Math.round(frac * 200 + 40);
    const b = Math.round((1 - frac) * 200 + 40);
    const fill = `#${r.toString(16).padStart(2, "0")}55${b
      .toString(16)
      .padStart(2, "0")}ee`;
    scatterRows.push({ id: `pt-${i}`, lat, lon, t, fill });
  }

  // 2) A few 3D-WKP paths that float at a baked Z, each appearing at its own
  //    timestamp (whole-path trailing-window discard).
  const PATH_N = 6;
  const paths: Array<{ id: string; wkp: string; t: number }> = [];
  for (let i = 0; i < PATH_N; i += 1) {
    const frac = i / (PATH_N - 1);
    const t = T0 + Math.round(frac * DURATION);
    const baseZ = 200 + frac * 600; // floating elevation in meters
    const lon0 = ANCHOR_LON - 0.02 + i * 0.006;
    const lat0 = ANCHOR_LAT - 0.015;
    const coords: [number, number, number][] = [
      [lon0, lat0, baseZ],
      [lon0 + 0.004, lat0 + 0.01, baseZ],
      [lon0 + 0.01, lat0 + 0.016, baseZ],
    ];
    paths.push({ id: `path-${i}`, wkp: enc.line(coords), t });
  }

  // 3) Two 3D-WKP polygons that render as floating prisms: ring Z is the base,
  //    polygon_extrude_elevation is the prism height on top.
  const polys: Array<{
    id: string;
    wkp: string;
    t: number;
    height: number;
    fill: string;
  }> = [];
  for (let i = 0; i < 2; i += 1) {
    const frac = i / 1;
    const t = T0 + Math.round(frac * DURATION);
    const baseZ = 100 + i * 400;
    const cLon = ANCHOR_LON + 0.02 + i * 0.012;
    const cLat = ANCHOR_LAT + 0.012;
    const d = 0.004;
    const ring: [number, number, number][] = [
      [cLon - d, cLat - d, baseZ],
      [cLon + d, cLat - d, baseZ],
      [cLon + d, cLat + d, baseZ],
      [cLon - d, cLat + d, baseZ],
      [cLon - d, cLat - d, baseZ],
    ];
    polys.push({
      id: `prism-${i}`,
      wkp: enc.polygon(ring),
      t,
      height: 300 + i * 300,
      fill: i === 0 ? "#1f9e89cc" : "#cc4c33cc",
    });
  }

  // Assemble rows. Scatter rows use lat/lon point columns (no WKP).
  for (const s of scatterRows) {
    rows.push({
      geometry_id: s.id,
      layer_type: "scatter",
      wkp: "",
      timestamp: s.t,
      scatter_radius: String(SCATTER_RADIUS_M),
      scatter_fill: s.fill,
      polygon_fill: "",
      polygon_extrude_elevation: "",
      tooltip_html: `Point ${s.id}`,
    });
  }
  for (const p of paths) {
    rows.push({
      geometry_id: p.id,
      layer_type: "path",
      wkp: p.wkp,
      timestamp: p.t,
      scatter_radius: "",
      scatter_fill: "",
      polygon_fill: "",
      polygon_extrude_elevation: "",
      tooltip_html: `Path ${p.id}`,
    });
  }
  for (const p of polys) {
    rows.push({
      geometry_id: p.id,
      layer_type: "polygon",
      wkp: p.wkp,
      timestamp: p.t,
      scatter_radius: "",
      scatter_fill: "",
      polygon_fill: p.fill,
      polygon_extrude_elevation: String(p.height),
      tooltip_html: `Prism ${p.id}`,
    });
  }

  // CSV: include point columns for scatter on the same table.
  const header = [
    "geometry_id",
    "layer_type",
    "wkp",
    "point1_latitude",
    "point1_longitude",
    "timestamp",
    "scatter_radius",
    "scatter_fill",
    "polygon_fill",
    "polygon_extrude_elevation",
    "tooltip_html",
  ];
  const lines = [header.join(",")];
  const scatterById = new Map(scatterRows.map((s) => [s.id, s]));
  for (const row of rows) {
    const s = scatterById.get(row.geometry_id);
    lines.push(
      [
        row.geometry_id,
        row.layer_type,
        row.wkp,
        s ? s.lat.toFixed(6) : "",
        s ? s.lon.toFixed(6) : "",
        row.timestamp,
        row.scatter_radius,
        row.scatter_fill,
        row.polygon_fill,
        row.polygon_extrude_elevation,
        row.tooltip_html,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${rows.length} rows to ${path.relative(process.cwd(), OUT_FILE)}`);
  console.log(
    `Time domain: ${new Date(T0 * 1000).toISOString()} .. ${new Date((T0 + DURATION) * 1000).toISOString()}`,
  );
  console.log(
    `Suggested settings: Trail length 120, Animation speed 60, Max height 1500. ` +
      `Domain is ${DURATION / 60} min; the sweep cycles in ~${Math.round(DURATION / 60)} s at speed 60.`,
  );
};

main().catch((error) => {
  console.error("Failed to generate WKP test data:", (error as Error).message);
  process.exit(1);
});
