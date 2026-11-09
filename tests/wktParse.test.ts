import test from "node:test";
import assert from "node:assert/strict";
import { parseSync } from "@loaders.gl/core";
import { WKTLoader } from "@loaders.gl/wkt";

// The mapper calls parseTextSync with the loader's default options instead of
// going through parseSync. Both must produce the same geometry.
const samples = [
  "POINT (175.2 -37.8)",
  "SRID=4326;LINESTRING (175 -37.8, 175.001 -37.799)",
  "LINESTRING Z (175 -37.8 10, 175.001 -37.799 20)",
  "MULTILINESTRING ((175 -37.8, 175.1 -37.7), (176 -38, 176.1 -38.1))",
  "POLYGON ((175 -37.8, 175.001 -37.8, 175.001 -37.799, 175 -37.799, 175 -37.8))",
  "POLYGON Z ((175.26 -37.72 120, 175.27 -37.72 120, 175.27 -37.73 120, 175.26 -37.72 120))",
  "MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((2 2, 3 2, 3 3, 2 2), (2.1 2.1, 2.2 2.1, 2.2 2.2, 2.1 2.1)))",
  "SRID=2193;POLYGON ((1 1, 2 1, 2 2, 1 1))",
  "not wkt",
  "LINESTRING (175 -37.8,",
];

test("parseTextSync with default options matches parseSync for WKT", () => {
  for (const sample of samples) {
    assert.deepStrictEqual(
      WKTLoader.parseTextSync(sample, { wkt: WKTLoader.options.wkt }),
      parseSync(sample, WKTLoader),
      sample,
    );
  }
});
