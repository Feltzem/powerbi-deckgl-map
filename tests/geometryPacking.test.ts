import test from "node:test";
import assert from "node:assert/strict";
import { parseSync } from "@loaders.gl/core";
import { WKTLoader } from "@loaders.gl/wkt";
import { Geometry } from "geojson";

import {
  PackedGeometryWriter,
  packGeoJson,
  packWkt,
  unpackGeometry,
} from "../src/geometryPacking";

const loadersGl = (text: string) => parseSync(text, WKTLoader) as Geometry | null;

const packOne = (text: string) => {
  const writer = new PackedGeometryWriter(1);
  const ok = packWkt(writer, text);
  return { ok, geometry: unpackGeometry(writer.finish(), 0) };
};

const fastPathCases = [
  "POINT (1 2)",
  "POINT(1 2)",
  "point (1 2)",
  "POINT Z (1 2 3)",
  "POINT (1 2 3)",
  "LINESTRING (1 2, 3 4)",
  "LINESTRING(1 2,3 4)",
  "LINESTRING (1.5e2 -2.25E-1, 3 4)",
  "LINESTRING (+1 2, .5 4)",
  "LINESTRING(1 2 , 3 4)",
  "LINESTRING (1\t2,\n3 4)",
  "LINESTRING (1 2, 3 4) ",
  "LINESTRING Z (1 2 3, 4 5 6)",
  "LINESTRING (175.2793123 -37.7870001, 175.2801 -37.788)",
  "POLYGON ((0 0, 1 0, 1 1, 0 0))",
  "POLYGON ((0 0, 1 0, 1 1, 0 0), (0.1 0.1, 0.2 0.1, 0.2 0.2, 0.1 0.1))",
  "MULTIPOINT ((1 2), (3 4))",
  "MULTIPOINT (1 2, 3 4)",
  "MULTILINESTRING ((1 2, 3 4), (5 6, 7 8))",
  "MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((2 2, 3 2, 3 3, 2 2), (2.1 2.1, 2.2 2.1, 2.2 2.2, 2.1 2.1)))",
];

// Left to loaders.gl so results (including nulls and their error messages) stay exactly as before.
const fallbackCases = [
  " LINESTRING (1 2, 3 4)",
  "SRID=4326;POINT (1 2)",
  "POINT EMPTY",
  "LINESTRING EMPTY",
  "POINT M (1 2 3)",
  "POINT ZM (1 2 3 4)",
  "GEOMETRYCOLLECTION (POINT (1 2), LINESTRING (1 2, 3 4))",
  "LINESTRING (1 2, 3)",
  "LINESTRING (1 2, 3 4",
  "LINESTRING (1 2, 3 4,)",
  "LINESTRING (1 2, 3 4 5)",
  "LINESTRING (1e 2, 3 4)",
  "garbage",
  "",
];

test("fast WKT path matches loaders.gl on common geometry", () => {
  for (const text of fastPathCases) {
    const { ok, geometry } = packOne(text);
    assert.ok(ok, `fast path should accept ${JSON.stringify(text)}`);
    assert.deepEqual(geometry, loadersGl(text), text);
  }
});

test("unusual or malformed WKT is left for loaders.gl", () => {
  for (const text of fallbackCases) {
    const { ok, geometry } = packOne(text);
    assert.equal(ok, false, `fast path should decline ${JSON.stringify(text)}`);
    assert.equal(geometry, null);
  }
});

test("randomised lines and polygons match loaders.gl exactly", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const coord = () => `${(175 + random()).toFixed(1 + Math.floor(random() * 9))} ${(-38 + random()).toFixed(7)}`;
  for (let i = 0; i < 300; i += 1) {
    const n = 2 + Math.floor(random() * 30);
    const line = Array.from({ length: n }, coord).join(", ");
    const ring = Array.from({ length: 3 }, coord);
    const text =
      i % 3 === 0
        ? `LINESTRING (${line})`
        : i % 3 === 1
          ? `POLYGON ((${[...ring, ring[0]].join(", ")}))`
          : `MULTILINESTRING ((${line}), (${line}))`;
    const { ok, geometry } = packOne(text);
    assert.ok(ok);
    assert.deepEqual(geometry, loadersGl(text));
  }
});

test("a batch keeps rows independent when some fail", () => {
  const texts = ["LINESTRING (1 2, 3 4)", "garbage", "POINT Z (5 6 7)", "POLYGON ((0 0, 1 0, 1 1, 0 0))"];
  const writer = new PackedGeometryWriter(texts.length + 1);
  texts.forEach((text) => packWkt(writer, text));
  writer.empty();
  const batch = writer.finish();
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((row) => unpackGeometry(batch, row)),
    [loadersGl(texts[0]), null, loadersGl(texts[2]), loadersGl(texts[3]), null],
  );
});

test("GeoJSON round-trips through the packed form", () => {
  const geometries: Geometry[] = [
    { type: "Point", coordinates: [1, 2] },
    { type: "LineString", coordinates: [[1, 2, 3], [4, 5, 6]] },
    { type: "MultiPoint", coordinates: [[1, 2], [3, 4]] },
    { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    { type: "MultiLineString", coordinates: [[[1, 2], [3, 4]], [[5, 6], [7, 8], [9, 10]]] },
    {
      type: "MultiPolygon",
      coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[2, 2], [3, 2], [3, 3], [2, 2]], [[2.1, 2.1], [2.2, 2.1], [2.2, 2.2], [2.1, 2.1]]]],
    },
  ];
  const writer = new PackedGeometryWriter(geometries.length + 2);
  geometries.forEach((geometry) => assert.ok(packGeoJson(writer, geometry)));
  assert.equal(packGeoJson(writer, { type: "GeometryCollection", geometries: [] }), false);
  assert.equal(packGeoJson(writer, { type: "LineString", coordinates: [[1, 2], [3, 4, 5]] }), false);
  const batch = writer.finish();
  geometries.forEach((geometry, row) => assert.deepEqual(unpackGeometry(batch, row), geometry));
  assert.equal(unpackGeometry(batch, geometries.length), null);
  assert.equal(unpackGeometry(batch, geometries.length + 1), null);
});
