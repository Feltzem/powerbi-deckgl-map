import test from "node:test";
import assert from "node:assert/strict";
import powerbi from "powerbi-visuals-api";

import { InputLayerType, OurData } from "../src/dataTypes";
import { getDataBoundingBox, validateData } from "../src/geom";

const makeData = (overrides: Partial<OurData>): OurData => ({
  id: "geometry-1",
  labelText: null,
  labelPriority: null,
  sourceOrder: 0,
  type: null,
  selectionId: {} as powerbi.visuals.ISelectionId,
  tooltipHtml: null,
  timestampSeconds: null,
  ...overrides,
});

test("validateData accepts a 3D polygon (Z is ignored)", () => {
  const data = makeData({
    type: InputLayerType.Polygon,
    polygonData: {
      type: "Polygon",
      coordinates: [
        [
          [175.0, -37.0, 100.0],
          [175.1, -37.0, 100.0],
          [175.1, -37.1, 100.0],
          [175.0, -37.0, 100.0],
        ],
      ],
    },
  });
  assert.equal(validateData(data), true);
});

test("bounding box of a 3D path matches its 2D footprint (Z ignored)", () => {
  const data3d = makeData({
    type: InputLayerType.Path,
    pathData: {
      type: "LineString",
      coordinates: [
        [175.0, -37.0, 5.0],
        [175.2, -37.3, 999.0],
      ],
    },
  });
  const data2d = makeData({
    type: InputLayerType.Path,
    pathData: {
      type: "LineString",
      coordinates: [
        [175.0, -37.0],
        [175.2, -37.3],
      ],
    },
  });
  assert.deepEqual(getDataBoundingBox([data3d]), getDataBoundingBox([data2d]));
});
