import test from "node:test";
import assert from "node:assert/strict";

import {
  getArcLabelAnchor,
  getLineLabelAnchor,
  getLineStringLabelAnchor,
  getPathLabelAnchor,
  getPointLabelAnchor,
  getPolygonLabelAnchor,
  isFiniteLabelAnchor,
} from "../src/labels/labelPlacement";
import { InputLayerType, OurData } from "../src/dataTypes";

const pointData = (lon: number, lat: number, elevation?: number): OurData =>
  ({
    id: "point",
    labelText: "Point",
    labelPriority: null,
    sourceOrder: 0,
    type: InputLayerType.Scatter,
    scatterData: {
      lon,
      lat,
      elevation: elevation ?? null,
      radius: null,
      heatmapWeight: null,
    },
  }) as OurData;

const lineData = (type: InputLayerType.Line | InputLayerType.Arc): OurData =>
  ({
    id: "line",
    labelText: "Line",
    labelPriority: null,
    sourceOrder: 0,
    type,
    lineData: {
      point1: { lon: 0, lat: 0 },
      point2: { lon: 2, lat: 0 },
    },
    arcData: {
      point1: { lon: 0, lat: 0 },
      point2: { lon: 2, lat: 0 },
    },
  }) as OurData;

test("point labels use the rendered point elevation", () => {
  assert.deepEqual(getPointLabelAnchor(pointData(10, 20, 30)), [10, 20, 30]);
  assert.deepEqual(getPointLabelAnchor(pointData(10, 20)), [10, 20, 0.1]);
});

test("line and arc labels use their rendered midpoint and arc apex", () => {
  assert.deepEqual(
    getLineLabelAnchor(lineData(InputLayerType.Line)),
    [1, 0, 0.1],
  );
  assert.deepEqual(getArcLabelAnchor(lineData(InputLayerType.Arc)), [1, 0, 1]);
});

test("line string labels follow half of cumulative segment length including Z", () => {
  assert.deepEqual(
    getLineStringLabelAnchor([
      [0, 0, 0],
      [1, 0, 2],
      [1, 3, 8],
    ]),
    [1, 1, 4],
  );
});

test("multipart paths select the longest component", () => {
  assert.deepEqual(
    getPathLabelAnchor({
      type: "MultiLineString",
      coordinates: [
        [
          [0, 0],
          [1, 0],
        ],
        [
          [10, 0],
          [10, 4],
        ],
      ],
    }),
    [10, 2, 0],
  );
});

test("polygon labels stay inside the outer ring and outside holes", () => {
  const anchor = getPolygonLabelAnchor({
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [4, 4],
        [6, 4],
        [6, 6],
        [4, 6],
        [4, 4],
      ],
    ],
  });

  assert.equal(isFiniteLabelAnchor(anchor), true);
  assert.equal(
    anchor[0] < 4 || anchor[0] > 6 || anchor[1] < 4 || anchor[1] > 6,
    true,
  );
});

test("polygon labels preserve base Z and add extrusion elevation", () => {
  assert.deepEqual(
    getPolygonLabelAnchor(
      {
        type: "Polygon",
        coordinates: [
          [
            [0, 0, 5],
            [4, 0, 5],
            [4, 4, 5],
            [0, 4, 5],
            [0, 0, 5],
          ],
        ],
      },
      12,
    ),
    [2, 2, 17],
  );
});
