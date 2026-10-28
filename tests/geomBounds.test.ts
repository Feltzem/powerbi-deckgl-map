import test from "node:test";
import assert from "node:assert/strict";

import { getDataBoundingBox, getLatLons, validateData } from "../src/geom";
import { OurData } from "../src/dataTypes";

// The implementation before the Float64Array rewrite, kept as the reference.
function referenceMinimalLongitudeRange(lons: number[]) {
  if (lons.length === 0) return null;
  const normalized = lons.filter((lon) => Number.isFinite(lon)).map((lon) => (lon < 0 ? lon + 360 : lon)).sort((a, b) => a - b);
  if (normalized.length === 0) return null;
  if (normalized.length === 1) {
    const lon = normalized[0] > 180 ? normalized[0] - 360 : normalized[0];
    return { minLon: lon, maxLon: lon };
  }
  let largestGap = -1;
  let gapIndex = -1;
  for (let i = 0; i < normalized.length; i++) {
    const next = i === normalized.length - 1 ? normalized[0] + 360 : normalized[i + 1];
    if (next - normalized[i] > largestGap) {
      largestGap = next - normalized[i];
      gapIndex = i;
    }
  }
  const rangeStart = gapIndex === normalized.length - 1 ? normalized[0] : normalized[gapIndex + 1];
  let rangeEnd = normalized[gapIndex];
  if (rangeEnd < rangeStart) rangeEnd += 360;
  if (rangeStart > 180 && rangeEnd > 180) return { minLon: rangeStart - 360, maxLon: rangeEnd - 360 };
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
  const range = referenceMinimalLongitudeRange(lons);
  if (!range || minLat === Infinity || maxLat === -Infinity) return null;
  return { minLon: range.minLon, minLat, maxLon: range.maxLon, maxLat };
}

function referenceValidate(d: OurData) {
  const [lats, lons] = getLatLons(d);
  return lats.every((lat) => !(isNaN(lat) || !isFinite(lat) || lat < -90 || lat > 90)) &&
    lons.every((lon) => !(isNaN(lon) || !isFinite(lon) || lon < -180 || lon > 180));
}

let seed = 11;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const lon = (centre: number) => (random() < 0.02 ? NaN : ((centre + (random() - 0.5) * 20 + 540) % 360) - 180);
const lat = () => (random() < 0.01 ? 95 : (random() - 0.5) * 170);
const position = (centre: number) => [lon(centre), lat()];

function randomPoint(centre: number): OurData {
  const kind = Math.floor(random() * 7);
  const d = { id: "x" } as OurData;
  if (kind === 0) d.scatterData = { lon: lon(centre), lat: lat() } as OurData["scatterData"];
  if (kind === 1) d.lineData = { point1: { lon: lon(centre), lat: lat() }, point2: { lon: lon(centre), lat: lat() } } as OurData["lineData"];
  if (kind === 2) d.arcData = { point1: { lon: lon(centre), lat: lat() }, point2: { lon: lon(centre), lat: lat() } } as OurData["arcData"];
  if (kind === 3) d.pathData = { type: "LineString", coordinates: [position(centre), position(centre), position(centre)] };
  if (kind === 4) d.pathData = { type: "MultiLineString", coordinates: [[position(centre), position(centre)], [position(centre)]], ...(random() < 0.3 ? { bbox: [lon(centre), lat(), lon(centre), lat()] } : {}) };
  if (kind === 5) d.polygonData = { type: "Polygon", coordinates: [[position(centre), position(centre), position(centre)]] };
  if (kind === 6) d.polygonData = { type: "MultiPolygon", coordinates: [[[position(centre), position(centre)]], [[position(centre)]]], ...(random() < 0.3 ? { bbox: [lon(centre), lat(), lon(centre), lat()] } : {}) };
  return d;
}

test("bounding box matches the previous implementation, including across the antimeridian", () => {
  for (const centre of [175, 179, -179, 0, 90, -90]) {
    for (const size of [0, 1, 2, 5, 50, 400]) {
      const data = Array.from({ length: size }, () => randomPoint(centre));
      assert.deepEqual(getDataBoundingBox(data), referenceBoundingBox(data), `centre ${centre}, ${size} points`);
    }
  }
});

test("longitude range matches a sorted scan on grids, duplicates and ties", () => {
  const cases: number[][] = [
    [10, 10, 10],
    [0, 90, 180, -90], // four equal gaps: the first one in sorted order wins
    [-180, 180],
    [179, -179, 178, -178],
    Array.from({ length: 1000 }, (_, i) => -180 + (i * 360) / 1000), // evenly spaced around the circle
    Array.from({ length: 500 }, (_, i) => 175 + (i % 50) * 0.01), // many duplicates
    Array.from({ length: 999 }, (_, i) => (i % 3) * 120 - 180),
  ];
  for (const lons of cases) {
    const data = lons.map((lon) => ({ id: "x", scatterData: { lon, lat: 0 } }) as OurData);
    assert.deepEqual(getDataBoundingBox(data), referenceBoundingBox(data), JSON.stringify(lons.slice(0, 6)));
  }
});

test("validation matches the previous implementation", () => {
  for (let i = 0; i < 2000; i++) {
    const d = randomPoint(i % 2 ? 179 : 10);
    assert.equal(validateData(d), referenceValidate(d));
  }
});
