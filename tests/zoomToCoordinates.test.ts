import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import {
  getCoordinateBounds,
  getZoomToCoordinatesState,
  toLngLatBounds,
} from "../src/zoomToCoordinates";
import { VisualFormattingSettingsModel } from "../src/settings";

(
  globalThis as unknown as {
    powerbi: { visuals: { ValidatorType: { Min: string; Max: string } } };
  }
).powerbi = {
  visuals: {
    ValidatorType: {
      Min: "Min",
      Max: "Max",
    },
  },
};

const hamilton = { south: -37.85, west: 175.2, north: -37.7, east: 175.35 };

test("getCoordinateBounds normalises the area and accepts either order", () => {
  const expected = {
    minLat: -37.85,
    maxLat: -37.7,
    minLon: 175.2,
    maxLon: 175.35,
  };
  assert.deepEqual(getCoordinateBounds(hamilton), expected);
  assert.deepEqual(
    getCoordinateBounds({
      south: hamilton.north,
      north: hamilton.south,
      west: hamilton.east,
      east: hamilton.west,
    }),
    expected,
  );
});

test("getCoordinateBounds rejects empty or invalid areas", () => {
  assert.equal(getCoordinateBounds({ ...hamilton, north: hamilton.south }), null);
  assert.equal(getCoordinateBounds({ ...hamilton, east: hamilton.west }), null);
  assert.equal(getCoordinateBounds({ ...hamilton, west: Number.NaN }), null);
});

test("getCoordinateBounds clamps to the map's latitude and longitude range", () => {
  assert.deepEqual(
    getCoordinateBounds({ south: -90, west: -200, north: 90, east: 200 }),
    { minLat: -85, maxLat: 85, minLon: -180, maxLon: 180 },
  );
});

test("toLngLatBounds returns MapLibre [[west, south], [east, north]]", () => {
  assert.deepEqual(toLngLatBounds(getCoordinateBounds(hamilton)!), [
    [175.2, -37.85],
    [175.35, -37.7],
  ]);
});

test("zoom to coordinates state: off, on, and locked", () => {
  const off = getZoomToCoordinatesState({ ...hamilton, enabled: false, lock: true });
  assert.equal(off.viewBounds, null);
  assert.equal(off.maxBounds, null);
  assert.equal(off.signature, "off");

  const on = getZoomToCoordinatesState({ ...hamilton, enabled: true, lock: false });
  assert.ok(on.viewBounds);
  assert.equal(on.maxBounds, null);

  const locked = getZoomToCoordinatesState({ ...hamilton, enabled: true, lock: true });
  assert.deepEqual(locked.maxBounds, locked.viewBounds);
  assert.notEqual(locked.signature, on.signature);

  const moved = getZoomToCoordinatesState({
    ...hamilton,
    north: -37.6,
    enabled: true,
    lock: true,
  });
  assert.notEqual(moved.signature, locked.signature);
});

test("an invalid area falls back to fitting the data", () => {
  const state = getZoomToCoordinatesState({
    ...hamilton,
    north: hamilton.south,
    enabled: true,
    lock: true,
  });
  assert.equal(state.viewBounds, null);
  assert.equal(state.maxBounds, null);
});

test("Map card exposes Zoom to coordinates, off by default, with the lock shown only when on", () => {
  const settings = new VisualFormattingSettingsModel();
  const map = settings.map;
  assert.equal(map.zoomToCoordinates.value, false);
  assert.equal(map.lockToCoordinates.value, false);
  assert.equal(map.zoomToCoordinates.displayName, "Zoom to coordinates");

  map.applyBasemapVisibility();
  assert.equal(map.lockToCoordinates.visible, false);
  map.zoomToCoordinates.value = true;
  map.applyBasemapVisibility();
  assert.equal(map.lockToCoordinates.visible, true);

  const names = map.slices.map((slice) => slice.name);
  assert.ok(names.indexOf("zoomToCoordinates") < names.indexOf("initialSouth"));
});

test("capabilities declare the Zoom to coordinates toggles", () => {
  const capabilities = JSON.parse(
    readFileSync(new URL("../capabilities.json", import.meta.url), "utf8"),
  );
  const props = capabilities.objects.mapProps.properties;
  assert.deepEqual(props.zoomToCoordinates.type, { bool: true });
  assert.deepEqual(props.lockToCoordinates.type, { bool: true });
});
