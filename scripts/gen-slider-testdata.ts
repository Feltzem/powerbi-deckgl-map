// One-off generator: a CSV tuned for testing the on-map TIME SLIDER (scrub /
// play-pause / step). Unlike the dense animation rug, this places a small set of
// clearly identifiable, evenly-spaced markers at known times so you can scrub to
// a moment and verify by eye which markers fall inside the trailing window.
//
// Run: node --import tsx scripts/gen-slider-testdata.ts
// Output: samples/animation/slider_testdata.csv
//
// Layout: 12 "clock" markers in a ring around Hamilton, one per hour across a
// 12-hour day, labelled H00..H11. Each is a large scatter point whose timestamp
// is exactly on the hour, and whose tooltip names the hour. With Trail length
// set to e.g. 1 hour you should see ~1-2 markers lit at any scrub position; with
// a longer trail you see a wider arc. The fill ramps blue -> red by hour so the
// leading edge of the window is obvious.
//
// Scatter has no WKP, so this generator needs no WASM; it is plain CSV.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "samples", "animation");
const OUT_FILE = path.join(OUT_DIR, "slider_testdata.csv");

const ANCHOR_LON = 175.27;
const ANCHOR_LAT = -37.79;
const RING_RADIUS_DEG = 0.012; // ~1.3 km ring so markers are well separated
const SCATTER_RADIUS_M = 120;

// 12 hourly markers across a half-day, on the hour, as real epoch seconds (so
// the slider label and tooltip show readable clock times).
const T0 = Math.floor(Date.parse("2026-06-15T08:00:00Z") / 1000);
const HOURS = 12;
const HOUR = 3600;

const M_PER_DEG_LAT = 111_320;
const mPerDegLon = (lat: number) =>
  (Math.PI / 180) * 6_378_137 * Math.cos((lat * Math.PI) / 180);

const csvEscape = (value: string | number): string => {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  .toString(16)
  .padStart(2, "0");

const main = async () => {
  const header = [
    "geometry_id",
    "layer_type",
    "point1_latitude",
    "point1_longitude",
    "timestamp",
    "scatter_radius",
    "scatter_fill",
    "tooltip_html",
  ];
  const lines = [header.join(",")];

  for (let h = 0; h < HOURS; h += 1) {
    const frac = h / (HOURS - 1);
    // Place markers clockwise starting at the top (12 o'clock).
    const angle = (h / HOURS) * Math.PI * 2 - Math.PI / 2;
    const lon = ANCHOR_LON + (Math.cos(angle) * RING_RADIUS_DEG) /
      (mPerDegLon(ANCHOR_LAT) / M_PER_DEG_LAT);
    const lat = ANCHOR_LAT + Math.sin(angle) * RING_RADIUS_DEG;
    const t = T0 + h * HOUR;
    const fill = `#${hex2(frac * 210 + 30)}40${hex2((1 - frac) * 210 + 30)}ee`;
    const clock = new Date(t * 1000).toISOString().slice(11, 16);
    const id = `H${String(h).padStart(2, "0")}`;
    lines.push(
      [
        id,
        "scatter",
        lat.toFixed(6),
        lon.toFixed(6),
        t,
        SCATTER_RADIUS_M,
        fill,
        `<b>${id}</b><br>${clock} UTC`,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${HOURS} hourly markers to ${path.relative(process.cwd(), OUT_FILE)}`);
  console.log(
    `Domain ${new Date(T0 * 1000).toISOString()} .. ${new Date(
      (T0 + (HOURS - 1) * HOUR) * 1000,
    ).toISOString()}.`,
  );
  console.log(
    "Bind geometry_id, layer_type, point1_latitude/longitude, timestamp, " +
      "scatter_radius, scatter_fill, tooltip_html. Turn on Layer controls > " +
      "Show time slider. Set Trail length ~3600 and Max height ~1000; scrub the " +
      "thumb and watch the lit markers (and their height) track the window.",
  );
};

main().catch((error) => {
  console.error("Failed to generate slider test data:", (error as Error).message);
  process.exit(1);
});
