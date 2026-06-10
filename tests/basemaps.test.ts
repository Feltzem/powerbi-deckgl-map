import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_BASEMAP_ID,
  getBasemapStyle,
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
});

test("basemap options expose a concise author-facing list", () => {
  assert.deepEqual(
    basemapOptions.map((option) => [
      option.value,
      option.displayName,
    ]),
    [
      ["positron", "Light (Positron)"],
      ["positron_no_labels", "Light, no labels"],
      ["dark_matter", "Dark (Dark Matter)"],
      ["dark_matter_no_labels", "Dark, no labels"],
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
});
