import test from "node:test";
import assert from "node:assert/strict";

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
  assert.equal(settings.map.cartoApiKey.visible, true);
  assert.equal(settings.map.aerialBasemapOpacity.visible, false);

  setBaseMap(settings, "esri_world_imagery");
  settings.applyConditionalVisibility();
  assert.equal(settings.map.mapboxAccessToken.visible, false);
  assert.equal(settings.map.cartoApiKey.visible, false);
  assert.equal(settings.map.aerialBasemapOpacity.visible, true);

  setBaseMap(settings, "mapbox_satellite");
  settings.applyConditionalVisibility();
  assert.equal(settings.map.mapboxAccessToken.visible, true);
  assert.equal(settings.map.cartoApiKey.visible, false);
  assert.equal(settings.map.aerialBasemapOpacity.visible, true);

  setBaseMap(settings, "blank");
  settings.applyConditionalVisibility();
  assert.equal(settings.map.mapboxAccessToken.visible, false);
  assert.equal(settings.map.cartoApiKey.visible, false);
  assert.equal(settings.map.aerialBasemapOpacity.visible, false);
});

test("label formatting controls follow label, box, shadow, and glow toggles", () => {
  const settings = new VisualFormattingSettingsModel();
  const labels = settings.labels;

  settings.applyConditionalVisibility();
  assert.equal(labels.minZoom.visible, false);
  assert.equal(labels.boxFillColor.visible, false);
  assert.equal(labels.shadowColor.visible, false);
  assert.equal(labels.glowColor.visible, false);

  labels.showLabels.value = true;
  settings.applyConditionalVisibility();
  assert.equal(labels.minZoom.visible, true);
  assert.equal(labels.showBox.visible, true);
  assert.equal(labels.boxFillColor.visible, true);
  assert.equal(labels.shadowColor.visible, false);
  assert.equal(labels.glowColor.visible, false);

  labels.showBox.value = true;
  labels.showShadow.value = true;
  labels.showGlow.value = true;
  settings.applyConditionalVisibility();
  assert.equal(labels.boxFillColor.visible, true);
  assert.equal(labels.borderWidth.visible, true);
  assert.equal(labels.shadowBlur.visible, true);
  assert.equal(labels.shadowOffsetX.visible, true);
  assert.equal(labels.glowWidth.visible, true);
});

test("label settings expose all placement and box shape choices", () => {
  const settings = new VisualFormattingSettingsModel();
  assert.equal(settings.labels.placement.items.length, 9);
  assert.deepEqual(
    settings.labels.placement.items.map((item) => item.value),
    [
      "top-left",
      "top-center",
      "top-right",
      "middle-left",
      "middle-center",
      "middle-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ],
  );
  assert.deepEqual(
    settings.labels.boxShape.items.map((item) => item.value),
    ["rectangle", "rounded", "pill"],
  );
});

test("labels default to a readable boxed style", () => {
  const labels = new VisualFormattingSettingsModel().labels;

  assert.equal(labels.textColor.value.value, "#000000");
  assert.equal(labels.textOpacity.value, 255);
  assert.equal(labels.showBox.value, true);
  assert.equal(labels.boxFillColor.value.value, "#ffffff");
  assert.equal(labels.boxFillOpacity.value, 255);
  assert.equal(labels.boxShape.value.value, "rounded");
  assert.equal(labels.borderColor.value.value, "#000000");
  assert.equal(labels.borderOpacity.value, 255);
  assert.equal(labels.borderWidth.value, 1);
});
