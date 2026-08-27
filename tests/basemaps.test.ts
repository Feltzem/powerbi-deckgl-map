import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_BASEMAP_ID,
  clampAerialBasemapOpacity,
  getBasemapStyle,
  getBasemapStyleSignature,
  isAerialBasemap,
  resolveBasemapAlias,
  resolveBasemap,
  basemapOptions,
} from "../src/basemaps";

test("getBasemapStyle preserves CARTO raster tile styles", () => {
  const style = getBasemapStyle("dark_all");

  if (typeof style === "string") {
    assert.fail("Expected a raster style object");
  }

  assert.equal(style.version, 8);
  assert.equal(style.sources["raster-tiles"].type, "raster");
  assert.deepEqual(style.sources["raster-tiles"].tiles, [
    "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  ]);
  assert.equal(style.layers[0].type, "raster");
  assert.equal(style.layers[0].paint["raster-opacity"], 1);
});

test("getBasemapStyle adds a trimmed and encoded CARTO API key", () => {
  const style = getBasemapStyle("dark_all", {
    cartoApiKey: " carto key/? ",
  }) as any;

  assert.deepEqual(style.sources["raster-tiles"].tiles, [
    "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=carto%20key%2F%3F",
    "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=carto%20key%2F%3F",
    "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=carto%20key%2F%3F",
    "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=carto%20key%2F%3F",
  ]);
  assert.match(style.sources["raster-tiles"].attribution, /OpenStreetMap/);
  assert.match(style.sources["raster-tiles"].attribution, /CARTO/);
});

test("basemap options expose a concise author-facing list", () => {
  assert.deepEqual(
    basemapOptions.map((option) => [option.value, option.displayName]),
    [
      ["positron", "Light (Positron)"],
      ["positron_no_labels", "Light, no labels"],
      ["dark_matter", "Dark (Dark Matter)"],
      ["dark_matter_no_labels", "Dark, no labels"],
      ["esri_world_imagery", "Satellite (Esri World Imagery)"],
      ["mapbox_satellite", "Satellite (Mapbox BYOK)"],
      ["blank", "Blank"],
      ["rastertiles/voyager", "Voyager (Colour)"],
      ["rastertiles/voyager_nolabels", "Voyager, no labels"],
    ],
  );
});

test("getBasemapStyle resolves web app styles to local raster styles", () => {
  const assertRasterTiles = (baseMap: string, expectedRasterId: string) => {
    const style = getBasemapStyle(baseMap) as any;

    assert.equal(style.sources["raster-tiles"].type, "raster");
    assert.deepEqual(style.sources["raster-tiles"].tiles, [
      `https://a.basemaps.cartocdn.com/${expectedRasterId}/{z}/{x}/{y}{r}.png`,
      `https://b.basemaps.cartocdn.com/${expectedRasterId}/{z}/{x}/{y}{r}.png`,
      `https://c.basemaps.cartocdn.com/${expectedRasterId}/{z}/{x}/{y}{r}.png`,
      `https://d.basemaps.cartocdn.com/${expectedRasterId}/{z}/{x}/{y}{r}.png`,
    ]);
  };

  assertRasterTiles("positron", "light_all");
  assertRasterTiles("positron_no_labels", "light_nolabels");
  assertRasterTiles("dark_matter", "dark_all");
  assertRasterTiles("dark_matter_no_labels", "dark_nolabels");
  assertRasterTiles("rastertiles/voyager", "rastertiles/voyager");
  assertRasterTiles(
    "rastertiles/voyager_nolabels",
    "rastertiles/voyager_nolabels",
  );
  assert.deepEqual(getBasemapStyle("blank"), {
    version: 8,
    sources: {},
    layers: [],
  });
});

test("getBasemapStyle creates Esri World Imagery aerial raster styles", () => {
  const style = getBasemapStyle("esri_world_imagery", {
    aerialOpacity: 45,
  }) as any;

  assert.equal(style.sources["raster-tiles"].type, "raster");
  assert.deepEqual(style.sources["raster-tiles"].tiles, [
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  ]);
  assert.match(style.sources["raster-tiles"].attribution, /Esri/);
  assert.equal(style.layers[0].paint["raster-opacity"], 0.45);
});

test("getBasemapStyle creates Mapbox BYOK satellite styles with a token", () => {
  const style = getBasemapStyle("mapbox_satellite", {
    mapboxAccessToken: " pk.test-token ",
    aerialOpacity: 25,
  }) as any;

  assert.deepEqual(style.sources["raster-tiles"].tiles, [
    "https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.jpg90?access_token=pk.test-token",
  ]);
  assert.match(style.sources["raster-tiles"].attribution, /Mapbox/);
  assert.equal(style.layers[0].paint["raster-opacity"], 0.25);
});

test("blank Mapbox token falls back to Esri imagery", () => {
  const style = getBasemapStyle("mapbox_satellite", {
    mapboxAccessToken: " ",
    aerialOpacity: 80,
  }) as any;

  assert.deepEqual(style.sources["raster-tiles"].tiles, [
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  ]);
  assert.equal(style.layers[0].paint["raster-opacity"], 0.8);
});

test("aerial basemap helpers identify and clamp satellite options", () => {
  assert.equal(isAerialBasemap("positron"), false);
  assert.equal(isAerialBasemap("esri_world_imagery"), true);
  assert.equal(isAerialBasemap("mapbox_satellite"), true);

  assert.equal(clampAerialBasemapOpacity(-10), 0);
  assert.equal(clampAerialBasemapOpacity(50), 0.5);
  assert.equal(clampAerialBasemapOpacity(130), 1);
  assert.equal(clampAerialBasemapOpacity("not-a-number"), 1);
});

test("basemap style signatures rebuild only when provider tiles change", () => {
  assert.equal(
    getBasemapStyleSignature("esri_world_imagery", "token-a"),
    getBasemapStyleSignature("esri_world_imagery", "token-b"),
  );
  assert.equal(
    getBasemapStyleSignature("mapbox_satellite", " pk.test-token "),
    "mapbox_satellite:pk.test-token",
  );
  assert.notEqual(
    getBasemapStyleSignature("mapbox_satellite", "token-a"),
    getBasemapStyleSignature("mapbox_satellite", "token-b"),
  );
  assert.equal(
    getBasemapStyleSignature("dark_all", "mapbox-a", " carto-a "),
    "dark_matter:carto-a",
  );
  assert.notEqual(
    getBasemapStyleSignature("dark_all", "mapbox-a", "carto-a"),
    getBasemapStyleSignature("dark_all", "mapbox-a", "carto-b"),
  );
  assert.equal(
    getBasemapStyleSignature("esri_world_imagery", "mapbox-a", "carto-a"),
    getBasemapStyleSignature("esri_world_imagery", "mapbox-b", "carto-b"),
  );
  assert.equal(
    getBasemapStyleSignature("not-a-real-basemap", "token-a"),
    `${DEFAULT_BASEMAP_ID}:`,
  );
});

test("legacy basemap ids resolve to canonical visible ids", () => {
  assert.deepEqual(
    [
      "deck_light",
      "light_all",
      "light_nolabels",
      "light_only_labels",
      "deck_dark",
      "dark_all",
      "dark_nolabels",
      "dark_only_labels",
      "rastertiles/voyager_only_labels",
      "rastertiles/voyager_labels_under",
      "openfreemap/bright",
      "openfreemap/liberty",
      "openfreemap/positron",
    ].map((id) => [id, resolveBasemapAlias(id)]),
    [
      ["deck_light", "positron"],
      ["light_all", "positron"],
      ["light_nolabels", "positron_no_labels"],
      ["light_only_labels", "positron"],
      ["deck_dark", "dark_matter"],
      ["dark_all", "dark_matter"],
      ["dark_nolabels", "dark_matter_no_labels"],
      ["dark_only_labels", "dark_matter"],
      ["rastertiles/voyager_only_labels", "rastertiles/voyager"],
      ["rastertiles/voyager_labels_under", "rastertiles/voyager"],
      ["openfreemap/bright", "positron"],
      ["openfreemap/liberty", "rastertiles/voyager"],
      ["openfreemap/positron", "positron_no_labels"],
    ],
  );
});

test("unknown basemap ids fall back to the default basemap", () => {
  const resolved = resolveBasemap("not-a-real-basemap");

  assert.equal(resolved.id, DEFAULT_BASEMAP_ID);
  assert.equal(resolved.kind, "carto-raster");
  assert.equal(resolved.isAerial, false);
});
