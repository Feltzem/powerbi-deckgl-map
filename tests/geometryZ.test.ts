import test from "node:test";
import assert from "node:assert/strict";
import {
  LineString,
  MultiLineString,
  MultiPolygon,
  Polygon,
} from "geojson";

import { geometryHasZ, positionHasZ } from "../src/geometryZ";

test("positionHasZ detects a finite third ordinate", () => {
  assert.equal(positionHasZ([175, -37, 5]), true);
  assert.equal(positionHasZ([175, -37]), false);
});

test("positionHasZ rejects non-finite Z", () => {
  assert.equal(positionHasZ([175, -37, Number.NaN]), false);
  assert.equal(positionHasZ([175, -37, Number.POSITIVE_INFINITY]), false);
});

test("geometryHasZ is true for a 3D LineString", () => {
  const geometry: LineString = {
    type: "LineString",
    coordinates: [
      [175.0, -37.0, 5.0],
      [175.1, -37.1, 10.0],
    ],
  };
  assert.equal(geometryHasZ(geometry), true);
});

test("geometryHasZ is false for a 2D LineString (back-compat)", () => {
  const geometry: LineString = {
    type: "LineString",
    coordinates: [
      [175.0, -37.0],
      [175.1, -37.1],
    ],
  };
  assert.equal(geometryHasZ(geometry), false);
});

test("geometryHasZ detects Z on any vertex of a MultiLineString", () => {
  const geometry: MultiLineString = {
    type: "MultiLineString",
    coordinates: [
      [
        [175.0, -37.0],
        [175.1, -37.1],
      ],
      [
        [176.0, -38.0, 12.0],
        [176.1, -38.1],
      ],
    ],
  };
  assert.equal(geometryHasZ(geometry), true);
});

test("geometryHasZ detects Z on a Polygon ring", () => {
  const geometry: Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [175.0, -37.0, 100.0],
        [175.1, -37.0, 100.0],
        [175.1, -37.1, 100.0],
        [175.0, -37.0, 100.0],
      ],
    ],
  };
  assert.equal(geometryHasZ(geometry), true);
});

test("geometryHasZ is false for a 2D Polygon", () => {
  const geometry: Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [175.0, -37.0],
        [175.1, -37.0],
        [175.1, -37.1],
        [175.0, -37.0],
      ],
    ],
  };
  assert.equal(geometryHasZ(geometry), false);
});

test("geometryHasZ detects Z deep inside a MultiPolygon", () => {
  const geometry: MultiPolygon = {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [175.0, -37.0],
          [175.1, -37.0],
          [175.1, -37.1],
          [175.0, -37.0],
        ],
      ],
      [
        [
          [176.0, -38.0, 50.0],
          [176.1, -38.0, 50.0],
          [176.1, -38.1, 50.0],
          [176.0, -38.0, 50.0],
        ],
      ],
    ],
  };
  assert.equal(geometryHasZ(geometry), true);
});

test("geometryHasZ tolerates null/undefined", () => {
  assert.equal(geometryHasZ(null), false);
  assert.equal(geometryHasZ(undefined), false);
});
