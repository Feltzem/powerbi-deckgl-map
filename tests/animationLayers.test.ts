import test from "node:test";
import assert from "node:assert/strict";

import {
  AnimationLayerLike,
  getActiveDeckLayerIds,
  getTemporalDeckLayerIds,
  updateTemporalAnimationLayers,
} from "../src/animationLayers";
import { LAYER_IDS } from "../src/layerState";
import { AnimationContext } from "../src/timeAnimation";

interface FakeLayer extends AnimationLayerLike {
  cloneProps?: Record<string, unknown>;
}

const makeCloneableLayer = (id: string): FakeLayer => ({
  id,
  clone(newProps: Record<string, unknown>): FakeLayer {
    return { id, cloneProps: newProps, clone: this.clone };
  },
});

const animation: AnimationContext = {
  active: true,
  domain: { t0: 100, t1: 200 },
  time: 125,
  trailLength: 15,
  maxHeight: 750,
};

test("getActiveDeckLayerIds preserves actual temporal layer ids", () => {
  const temporalIds = getTemporalDeckLayerIds();

  assert.deepEqual(
    getActiveDeckLayerIds([
      { id: temporalIds.scatter },
      { id: LAYER_IDS.polygon },
      { id: temporalIds.path },
      { id: "" },
      {},
    ]),
    [temporalIds.scatter, LAYER_IDS.polygon, temporalIds.path],
  );
});

test("updateTemporalAnimationLayers clones only temporal layers", () => {
  const temporalIds = getTemporalDeckLayerIds();
  const staticLayer: FakeLayer = { id: LAYER_IDS.polygon };
  const scatterLayer = makeCloneableLayer(temporalIds.scatter);
  const pathLayer = makeCloneableLayer(temporalIds.path);

  const result = updateTemporalAnimationLayers(
    [staticLayer, scatterLayer, pathLayer],
    animation,
  );

  assert.equal(result.changed, true);
  assert.equal(result.layers[0], staticLayer);
  assert.notEqual(result.layers[1], scatterLayer);
  assert.notEqual(result.layers[2], pathLayer);
  assert.deepEqual(result.layers[1].cloneProps, {
    time: 25,
    maxHeight: 750,
    trailLength: 15,
  });
  assert.deepEqual(result.layers[2].cloneProps, {
    timeRange: [10, 25],
  });
});
