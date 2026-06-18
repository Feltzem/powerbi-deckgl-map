import test from "node:test";
import assert from "node:assert/strict";

import {
  getHeatmapColorRange,
  getScatterHeatmapWeight,
} from "../src/layers/heatmap";
import { OurData } from "../src/dataTypes";

const makeScatterPoint = (heatmapWeight: number | null): OurData =>
  ({
    scatterData: {
      lat: -37.8,
      lon: 175.2,
      radius: null,
      elevation: null,
      heatmapWeight,
    },
  }) as OurData;

test("getScatterHeatmapWeight falls back to 1 only when weight is unbound", () => {
  assert.equal(getScatterHeatmapWeight(makeScatterPoint(null)), 1);
  assert.equal(getScatterHeatmapWeight(makeScatterPoint(2.5)), 2.5);
  assert.equal(getScatterHeatmapWeight(makeScatterPoint(0)), 0);
  assert.equal(getScatterHeatmapWeight(makeScatterPoint(-1)), 0);
  assert.equal(getScatterHeatmapWeight({} as OurData), 0);
});

test("getHeatmapColorRange samples the selected gradient with opacity", () => {
  assert.deepEqual(getHeatmapColorRange("magma", 180, 3), [
    [0, 0, 4, 180],
    [181, 54, 121, 180],
    [252, 253, 191, 180],
  ]);
});
