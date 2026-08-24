import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LAYER_DRAW_ORDER,
  LABEL_LAYER_ID,
  LAYER_IDS,
  TEMPORAL_LABEL_LAYER_ID,
  getGeometryTypeForLayerId,
  getTemporalLayerId,
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

test("getGeometryTypeForLayerId resolves the animated -temporal layer ids", () => {
  // The temporal scatter/path layers use distinct ids so deck.gl replaces them
  // cleanly across the animation-activation class swap; tooltips must still map
  // those ids back to their geometry type.
  assert.equal(
    getGeometryTypeForLayerId(getTemporalLayerId("scatter")),
    "scatter",
  );
  assert.equal(getGeometryTypeForLayerId(getTemporalLayerId("path")), "path");
});

test("label layers use dedicated non-geometry IDs", () => {
  assert.equal(TEMPORAL_LABEL_LAYER_ID, `${LABEL_LAYER_ID}-temporal`);
  assert.equal(getGeometryTypeForLayerId(LABEL_LAYER_ID), null);
  assert.equal(getGeometryTypeForLayerId(TEMPORAL_LABEL_LAYER_ID), null);
});
