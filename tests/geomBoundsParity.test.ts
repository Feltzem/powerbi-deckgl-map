import test from "node:test";
import assert from "node:assert/strict";

import { getDataBoundingBox, getLatLons, validateData } from "../src/geom";
import { OurData } from "../src/dataTypes";

// Frozen copy of the 1.9.0.2 implementation: sort every longitude and take the
// widest circular gap. The current code must return exactly the same range.
function referenceMinimalLongitudeRange(lons: number[]): { minLon: number; maxLon: number } | null {
  if (lons.length === 0) {
    return null;
  }
  const normalized = lons
    .filter((lon) => Number.isFinite(lon))
    .map((lon) => (lon < 0 ? lon + 360 : lon))
    .sort((a, b) => a - b);
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.length === 1) {
    const lon = normalized[0] > 180 ? normalized[0] - 360 : normalized[0];
    return { minLon: lon, maxLon: lon };
  }
  let largestGap = -1;
  let gapIndex = -1;
  for (let i = 0; i < normalized.length; i++) {
    const current = normalized[i];
    const next = i === normalized.length - 1 ? normalized[0] + 360 : normalized[i + 1];
    const gap = next - current;
    if (gap > largestGap) {
      largestGap = gap;
      gapIndex = i;
    }
  }
  const rangeStart = gapIndex === normalized.length - 1 ? normalized[0] : normalized[gapIndex + 1];
  let rangeEnd = normalized[gapIndex];
  if (rangeEnd < rangeStart) {
    rangeEnd += 360;
  }
  if (rangeStart > 180 && rangeEnd > 180) {
    return { minLon: rangeStart - 360, maxLon: rangeEnd - 360 };
  }
  return { minLon: rangeStart > 180 ? rangeStart - 360 : rangeStart, maxLon: rangeEnd };
}

function referenceBoundingBox(data: OurData[]) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  const lons: number[] = [];
  for (const d of data) {
    const [lats, rowLons] = getLatLons(d);
    for (const lat of lats) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    lons.push(...rowLons);
  }
  const lonRange = referenceMinimalLongitudeRange(lons);
  if (!lonRange || minLat === Infinity || maxLat === -Infinity) {
    return null;
  }
  return { minLon: lonRange.minLon, minLat, maxLon: lonRange.maxLon, maxLat };
}

function referenceValidate(data: OurData): boolean {
  const [lats, lons] = getLatLons(data);
  return (
    lats.every((lat) => !(isNaN(lat) || !isFinite(lat) || lat < -90 || lat > 90)) &&
    lons.every((lon) => !(isNaN(lon) || !isFinite(lon) || lon < -180 || lon > 180))
  );
}

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const base = (id: number): OurData =>
  ({ id: String(id), labelText: null, labelPriority: null, sourceOrder: id, type: null, selectionId: null, tooltipHtml: null, timestampSeconds: null }) as unknown as OurData;

const scatter = (id: number, lat: number, lon: number): OurData => ({
  ...base(id),
  scatterData: { lat, lon, radius: null, elevation: null, heatmapWeight: null },
});

const path = (id: number, coordinates: number[][], withBbox: boolean): OurData => {
  const lons = coordinates.map((coordinate) => coordinate[0]);
  const lats = coordinates.map((coordinate) => coordinate[1]);
  return {
    ...base(id),
    pathData: {
      type: "LineString",
      coordinates,
      ...(withBbox ? { bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] } : {}),
    },
  } as OurData;
};

const polygon = (id: number, ring: number[][]): OurData =>
  ({ ...base(id), polygonData: { type: "MultiPolygon", coordinates: [[ring]] } }) as unknown as OurData;

const lonGenerators: Array<[string, (random: () => number) => number]> = [
  ["new zealand", (random) => 166 + random() * 12],
  ["antimeridian", (random) => { const lon = 170 + random() * 20; return lon > 180 ? lon - 360 : lon; }],
  ["world", (random) => -180 + random() * 360],
  ["two clusters", (random) => (random() < 0.5 ? -10 + random() : 10 + random())],
  ["americas", (random) => -120 + random() * 40],
  ["signed zeros", (random) => [0, -0, 0.5, -0.5][Math.floor(random() * 4)]],
  ["dirty", (random) => [NaN, Infinity, 400, -400, 179.999, -179.999, 180, -180][Math.floor(random() * 8)]],
  ["identical", () => 175.25],
  ["zeros only", (random) => (random() < 0.5 ? 0 : -0)],
];

test("getDataBoundingBox and validateData match the 1.9.0.2 implementation on seeded fuzz data", () => {
  const random = mulberry32(20261023);
  let cases = 0;
  for (const [name, nextLon] of lonGenerators) {
    for (const rowCount of [0, 1, 2, 3, 7, 50, 400]) {
      for (let repeat = 0; repeat < 6; repeat += 1) {
        const data: OurData[] = [];
        for (let index = 0; index < rowCount; index += 1) {
          const lat = random() < 0.02 ? NaN : -60 + random() * 120;
          const kind = index % 3;
          if (kind === 0) {
            data.push(scatter(index, lat, nextLon(random)));
          } else if (kind === 1) {
            const coordinates = [0, 1, 2].map(() => [nextLon(random), lat + random()]);
            data.push(path(index, coordinates, random() < 0.5));
          } else {
            const ring = [0, 1, 2, 3].map(() => [nextLon(random), lat - random()]);
            data.push(polygon(index, [...ring, ring[0]]));
          }
        }
        assert.deepStrictEqual(getDataBoundingBox(data), referenceBoundingBox(data), `${name}, ${rowCount} rows, repeat ${repeat}`);
        for (const row of data) {
          assert.equal(validateData(row), referenceValidate(row), `${name} validate`);
        }
        cases += 1;
      }
    }
  }
  assert.ok(cases > 300);
});
