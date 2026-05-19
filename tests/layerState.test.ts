import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LAYER_DRAW_ORDER,
  LAYER_IDS,
  getGeometryTypeForLayerId,
  parseLayerDrawOrder,
} from "../src/layerState";

test("parseLayerDrawOrder removes invalid entries and appends missing layers", () => {
  assert.deepEqual(parseLayerDrawOrder("polygon,arc,unknown,arc"), [
    "polygon",
    "arc",
    "scatter",
    "line",
    "path",
  ]);
});

test("parseLayerDrawOrder falls back to the default order for missing values", () => {
  assert.deepEqual(parseLayerDrawOrder(null), [...DEFAULT_LAYER_DRAW_ORDER]);
});

test("getGeometryTypeForLayerId handles exact and derived layer ids", () => {
  assert.equal(getGeometryTypeForLayerId(LAYER_IDS.polygon), "polygon");
  assert.equal(getGeometryTypeForLayerId(`${LAYER_IDS.path}-stroke`), "path");
  assert.equal(getGeometryTypeForLayerId("unknown-layer"), null);
});
