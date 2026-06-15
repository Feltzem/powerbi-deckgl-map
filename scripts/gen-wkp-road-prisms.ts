// One-off generator: emits a CSV of 3D-WKP restriction "wall" polygons laid out
// along a road, replicating the parking-review page's stacked floating prisms.
//
// Run: node --import tsx scripts/gen-wkp-road-prisms.ts
// Output: samples/animation/wkp_road_prisms_sample.csv
//
// Model (matches app.jsx heightenedRestrictions): each restriction segment has a
// validity window [from, to] inside the dataset's full time range [T0, T1]. Its
// floating prism is STATIC (it does NOT move with the animation playhead):
//   base z   h0 = (from - T0) / dt * MAX_HEIGHT     <- baked into the WKP ring Z
//   height        (to   - from) / dt * MAX_HEIGHT   <- polygon_extrude_elevation
// Segments at the same spot have sequential, non-overlapping windows, so they
// stack into a column of prisms; consecutive spots along the road shift the
// base, giving the Gantt-in-3D look that follows the street.

// @wkpjs/web ships a browser-only wasm loader that blocks require("fs") under
// Node. Mask process.versions.node so its env check takes the browser path,
// then feed the wasm bytes directly. See gen-wkp-testdata.ts for the rationale.
Object.defineProperty(process.versions, "node", {
  value: undefined,
  configurable: true,
});
(globalThis as { window?: unknown }).window = globalThis;
const wkpModulePromise = import("@wkpjs/web").then((mod) => mod.createWkp);

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

type CreateWkp = Awaited<typeof wkpModulePromise>;
type WkpModule = Awaited<ReturnType<CreateWkp>>;
type WkpContext = InstanceType<WkpModule["Context"]>;

const OUT_DIR = path.join(process.cwd(), "samples", "animation");
const OUT_FILE = path.join(OUT_DIR, "wkp_road_prisms_sample.csv");

// Full dataset time range (e.g. a week of restriction versions). h0/height are
// computed against THIS fixed range, not the playhead.
const T0 = Math.floor(Date.parse("2026-06-08T00:00:00Z") / 1000);
const T1 = Math.floor(Date.parse("2026-06-15T00:00:00Z") / 1000);
const DT = Math.max(T1 - T0, 1);
const MAX_HEIGHT = 80; // metres for the full range (review page uses ~50)

// A road centreline through Hamilton: a gently curving polyline. Each vertex is
// a "spot" that carries a stacked column of restriction prisms.
const ROAD_START = { lon: 175.262, lat: -37.804 };
const ROAD_BEARING_DEG = 35; // heading roughly NE
const SPOT_COUNT = 8;
const SPOT_SPACING_M = 35; // metres between restriction spots along the road
const WALL_HALF_WIDTH_M = 4; // half-width of each thin restriction wall (across road)
const WALL_LENGTH_M = 28; // along-road length of each wall segment

// Two restriction "types" cycled for colour, like P$ (green) / ADPP (magenta).
const TYPE_GREEN = "#19c819cc";
const TYPE_MAGENTA = "#c800c8cc";

const M_PER_DEG_LAT = 111_320;
const mPerDegLon = (lat: number) =>
  (Math.PI / 180) * 6_378_137 * Math.cos((lat * Math.PI) / 180);

// Offset a lon/lat by east/north metres.
const offsetMeters = (
  lon: number,
  lat: number,
  east: number,
  north: number,
): [number, number] => [
  lon + east / mPerDegLon(lat),
  lat + north / M_PER_DEG_LAT,
];

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
  const wasmBinary = await readFile(wasmPath);
  const createWkp = await wkpModulePromise;
  const wkp = await createWkp({ wasmBinary });
  const ctx: WkpContext = new wkp.Context();
  // Scalar precision: the per-dimension precision-array form truncates lon/lat
  // in this @wkpjs/web version.
  return (ring: [number, number, number][]): string =>
    wkp.encode(ctx, { type: "Polygon", coordinates: [ring] }, 6);
};

interface PrismRow {
  geometry_id: string;
  layer_type: "polygon";
  wkp: string;
  polygon_fill: string;
  polygon_extrude_elevation: string;
  valid_from: string;
  valid_to: string;
  tooltip_html: string;
}

const main = async () => {
  const encodePolygon = await createEncoder();
  const rows: PrismRow[] = [];

  const heading = (ROAD_BEARING_DEG * Math.PI) / 180;
  // Unit vectors: along-road (east/north) and across-road (perpendicular).
  const along = { e: Math.sin(heading), n: Math.cos(heading) };
  const across = { e: Math.cos(heading), n: -Math.sin(heading) };

  for (let spot = 0; spot < SPOT_COUNT; spot += 1) {
    // Spot centre advances along the road.
    const distAlong = spot * SPOT_SPACING_M;
    const [spotLon, spotLat] = offsetMeters(
      ROAD_START.lon,
      ROAD_START.lat,
      along.e * distAlong,
      along.n * distAlong,
    );

    // Each spot has a stack of 2-4 sequential restriction versions that tile the
    // full time range, so their prisms stack base-to-top into a column.
    const stackCount = 2 + (spot % 3); // 2..4
    const segLen = DT / stackCount;
    for (let v = 0; v < stackCount; v += 1) {
      const from = T0 + Math.round(v * segLen);
      const to = T0 + Math.round((v + 1) * segLen);
      const h0 = ((from - T0) / DT) * MAX_HEIGHT;
      const height = ((to - from) / DT) * MAX_HEIGHT;

      // Build the thin wall rectangle around the spot centre: WALL_LENGTH_M
      // along the road, WALL_HALF_WIDTH_M each side across it. All ring
      // vertices share the baked base z (h0).
      const halfLen = WALL_LENGTH_M / 2;
      const corners: Array<[number, number]> = [
        [-halfLen, -WALL_HALF_WIDTH_M],
        [+halfLen, -WALL_HALF_WIDTH_M],
        [+halfLen, +WALL_HALF_WIDTH_M],
        [-halfLen, +WALL_HALF_WIDTH_M],
        [-halfLen, -WALL_HALF_WIDTH_M], // close ring
      ];
      const ring: [number, number, number][] = corners.map(([a, c]) => {
        const east = along.e * a + across.e * c;
        const north = along.n * a + across.n * c;
        const [lon, lat] = offsetMeters(spotLon, spotLat, east, north);
        return [lon, lat, h0];
      });

      const isGreen = (spot + v) % 2 === 0;
      const id = `wall-${spot}-${v}`;
      rows.push({
        geometry_id: id,
        layer_type: "polygon",
        wkp: encodePolygon(ring),
        polygon_fill: isGreen ? TYPE_GREEN : TYPE_MAGENTA,
        polygon_extrude_elevation: height.toFixed(2),
        valid_from: new Date(from * 1000).toISOString(),
        valid_to: new Date(to * 1000).toISOString(),
        tooltip_html: `<b>${id}</b><br>${isGreen ? "P$" : "ADPP"}<br>${new Date(
          from * 1000,
        ).toISOString().slice(0, 10)} → ${new Date(to * 1000)
          .toISOString()
          .slice(0, 10)}`,
      });
    }
  }

  const header = [
    "geometry_id",
    "layer_type",
    "wkp",
    "polygon_fill",
    "polygon_extrude_elevation",
    "valid_from",
    "valid_to",
    "tooltip_html",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.geometry_id,
        r.layer_type,
        r.wkp,
        r.polygon_fill,
        r.polygon_extrude_elevation,
        r.valid_from,
        r.valid_to,
        r.tooltip_html,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, lines.join("\n") + "\n", "utf8");
  console.log(
    `Wrote ${rows.length} restriction prisms across ${SPOT_COUNT} road spots to ${path.relative(
      process.cwd(),
      OUT_FILE,
    )}`,
  );
  console.log(
    `Full range ${new Date(T0 * 1000).toISOString()} .. ${new Date(
      T1 * 1000,
    ).toISOString()}; base z + height baked for MAX_HEIGHT=${MAX_HEIGHT} m.`,
  );
};

main().catch((error) => {
  console.error("Failed to generate road prisms:", (error as Error).message);
  process.exit(1);
});
