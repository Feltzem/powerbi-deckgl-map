import test from "node:test";
import assert from "node:assert/strict";

import { VisualFormattingSettingsModel } from "../src/settings";

(globalThis as unknown as {
  powerbi: { visuals: { ValidatorType: { Min: string; Max: string } } };
}).powerbi = {
  visuals: {
    ValidatorType: {
      Min: "Min",
      Max: "Max",
    },
  },
};

const setBaseMap = (
  settings: VisualFormattingSettingsModel,
  value: string,
): void => {
  settings.map.baseMap.value = {
    value,
    displayName: value,
  };
};

test("satellite formatting controls are visible only for relevant basemaps", () => {
  const settings = new VisualFormattingSettingsModel();

  setBaseMap(settings, "positron");
  settings.applyConditionalVisibility();
  assert.equal(settings.map.mapboxAccessToken.visible, false);
  assert.equal(settings.map.aerialBasemapOpacity.visible, false);

  setBaseMap(settings, "esri_world_imagery");
  settings.applyConditionalVisibility();
  assert.equal(settings.map.mapboxAccessToken.visible, false);
  assert.equal(settings.map.aerialBasemapOpacity.visible, true);

  setBaseMap(settings, "mapbox_satellite");
  settings.applyConditionalVisibility();
  assert.equal(settings.map.mapboxAccessToken.visible, true);
  assert.equal(settings.map.aerialBasemapOpacity.visible, true);
});
