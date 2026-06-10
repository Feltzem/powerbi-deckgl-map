import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BUILDINGS_LAYER_ID,
  BUILDINGS_SOURCE_ID,
  DEFAULT_3D_BUILDINGS_MIN_ZOOM,
  MAX_3D_BUILDINGS_ZOOM,
  OPENFREEMAP_TILES_URL,
  clamp3DBuildingsMinZoom,
  create3DBuildingsLayer,
  create3DBuildingsSource,
  getFirstSymbolLayerId,
} from "../src/buildings";

const expressionIncludes = (expression: unknown, needle: string): boolean => {
  if (expression === needle) {
    return true;
  }

  if (!Array.isArray(expression)) {
    return false;
  }

  return expression.some((part) => expressionIncludes(part, needle));
};

test("create3DBuildingsSource uses OpenFreeMap vector tiles", () => {
  assert.deepEqual(create3DBuildingsSource(), {
    type: "vector",
    url: OPENFREEMAP_TILES_URL,
  });
});

test("create3DBuildingsLayer appears at full height from the min zoom", () => {
  const layer = create3DBuildingsLayer(16.25);

  assert.equal(layer.id, BUILDINGS_LAYER_ID);
  assert.equal(layer.source, BUILDINGS_SOURCE_ID);
  assert.equal(layer["source-layer"], "building");
  assert.equal(layer.type, "fill-extrusion");
  assert.equal(layer.minzoom, 16.25);
  assert.deepEqual(layer.paint["fill-extrusion-height"], [
    "to-number",
    ["get", "render_height"],
    0,
  ]);
  assert.deepEqual(layer.paint["fill-extrusion-base"], [
    "to-number",
    ["get", "render_min_height"],
    0,
  ]);
  assert.equal(
    expressionIncludes(layer.paint["fill-extrusion-height"], "zoom"),
    false,
  );
  assert.equal(
    expressionIncludes(layer.paint["fill-extrusion-base"], "zoom"),
    false,
  );
});

test("create3DBuildingsLayer defaults and clamps the min zoom", () => {
  assert.equal(
    create3DBuildingsLayer().minzoom,
    DEFAULT_3D_BUILDINGS_MIN_ZOOM,
  );
  assert.equal(create3DBuildingsLayer(-10).minzoom, 0);
  assert.equal(create3DBuildingsLayer(100).minzoom, MAX_3D_BUILDINGS_ZOOM);
  assert.equal(clamp3DBuildingsMinZoom("15"), DEFAULT_3D_BUILDINGS_MIN_ZOOM);
});

test("getFirstSymbolLayerId finds the first text symbol layer", () => {
  assert.equal(
    getFirstSymbolLayerId([
      { id: "background", type: "background" },
      { id: "icon-only", type: "symbol", layout: { "icon-image": "park" } },
      { id: "road-label", type: "symbol", layout: { "text-field": "Main" } },
      {
        id: "place-label",
        type: "symbol",
        layout: { "text-field": "Hamilton" },
      },
    ]),
    "road-label",
  );
  assert.equal(
    getFirstSymbolLayerId([{ id: "raster", type: "raster" }]),
    undefined,
  );
});

test("capabilities exposes 3D buildings settings and tile access", () => {
  const capabilities = JSON.parse(
    readFileSync(new URL("../capabilities.json", import.meta.url), "utf8"),
  );
  const mapProperties = capabilities.objects.mapProps.properties;
  const webAccess = capabilities.privileges.find(
    (privilege: { name?: string }) => privilege.name === "WebAccess",
  );

  assert.equal(mapProperties.show3DBuildings.type.bool, true);
  assert.equal(mapProperties.buildingsMinZoom.type.numeric, true);
  assert.ok(webAccess.parameters.includes("https://tiles.openfreemap.org"));
});
