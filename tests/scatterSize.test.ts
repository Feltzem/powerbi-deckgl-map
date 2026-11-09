import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import powerbi from "powerbi-visuals-api";

import { createEmptyColorRoleStatsStore } from "../src/colorRoles";
import { InputLayerType, OurData } from "../src/dataTypes";
import getScatterLayer from "../src/layers/scatter";
import {
  getRadiusDomain,
  getScatterRadiusMode,
  scaleRadiusToPixels,
} from "../src/scatterSize";
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

const makePoint = (id: string, radius: number | null): OurData => ({
  id,
  labelText: null,
  labelPriority: null,
  sourceOrder: 0,
  type: InputLayerType.Scatter,
  lineData: null,
  lineProperties: null,
  scatterData: {
    lat: -36.85,
    lon: 174.76,
    radius,
    elevation: null,
    heatmapWeight: null,
  },
  scatterProperties: {
    lineWidth: null,
    lineColor: null,
    lineColorValue: null,
    lineColorCategory: null,
    fillColor: [1, 2, 3, 255],
    fillColorValue: null,
    fillColorCategory: null,
  },
  arcData: null,
  arcProperties: null,
  pathData: null,
  pathProperties: null,
  polygonData: null,
  polygonProperties: null,
  selectionId: {} as powerbi.visuals.ISelectionId,
  tooltipHtml: null,
  timestampSeconds: null,
});

type RadiusLayerProps = {
  getRadius: (d: OurData) => number;
  radiusUnits: string;
  radiusMinPixels: number;
  radiusMaxPixels: number;
};

const makeLayer = (data: OurData[], mode: "meters" | "scale") => {
  const settings = new VisualFormattingSettingsModel();
  settings.scatter.radiusMode.value = { value: mode, displayName: mode };
  settings.scatter.sizeMinPixels.value = 4;
  settings.scatter.sizeMaxPixels.value = 40;
  const colorRoles = createEmptyColorRoleStatsStore();
  colorRoles.scatterFillColor.hasTextColor = true;
  colorRoles.scatterLineColor.hasTextColor = true;
  const layer = getScatterLayer(
    data,
    settings.scatter,
    settings.highlighting,
    new Set(),
    "",
    colorRoles,
    new Map(),
    "test",
    () => undefined,
  );
  return layer.props as unknown as RadiusLayerProps;
};

test("radius domain ignores missing and non-finite values", () => {
  assert.deepEqual(
    getRadiusDomain([3, null, 10, NaN, -2, undefined], (v) => v),
    { min: -2, max: 10 },
  );
  assert.equal(getRadiusDomain([null], (v) => v), null);
});

test("scaleRadiusToPixels maps the data range onto the pixel range", () => {
  const linear = {
    min: 0,
    max: 100,
    minPixels: 2,
    maxPixels: 22,
    scaleType: "linear" as const,
  };
  assert.equal(scaleRadiusToPixels(0, linear), 2);
  assert.equal(scaleRadiusToPixels(50, linear), 12);
  assert.equal(scaleRadiusToPixels(100, linear), 22);
  assert.equal(scaleRadiusToPixels(null, linear), 2);
  assert.equal(scaleRadiusToPixels(500, linear), 22);

  const area = { ...linear, scaleType: "area" as const };
  assert.equal(scaleRadiusToPixels(25, area), 12);

  const flat = { ...linear, min: 7, max: 7 };
  assert.equal(scaleRadiusToPixels(7, flat), 12);
});

test("radius mode defaults to metres for existing reports", () => {
  const settings = new VisualFormattingSettingsModel();
  assert.equal(getScatterRadiusMode(settings.scatter.radiusMode.value), "meters");
  assert.equal(getScatterRadiusMode(undefined), "meters");
  assert.equal(getScatterRadiusMode({ value: "scale" }), "scale");
});

test("metres mode keeps the existing behaviour", () => {
  const data = [makePoint("a", 1), makePoint("b", 100)];
  const props = makeLayer(data, "meters");
  assert.equal(props.radiusUnits, "meters");
  assert.equal(props.getRadius(data[0]), 1);
  assert.equal(props.getRadius(data[1]), 100);
  assert.equal(props.radiusMinPixels, 2);
});

test("scale mode gives points distinct pixel sizes from the radius field", () => {
  const data = [
    makePoint("a", 1),
    makePoint("b", 25),
    makePoint("c", 100),
    makePoint("d", null),
  ];
  const props = makeLayer(data, "scale");
  assert.equal(props.radiusUnits, "pixels");
  assert.equal(props.radiusMinPixels, 0);
  const sizes = data.map((d) => props.getRadius(d));
  assert.equal(sizes[0], 4);
  assert.equal(sizes[2], 40);
  assert.ok(sizes[1] > sizes[0] && sizes[1] < sizes[2]);
  assert.equal(sizes[3], 4);
});

test("capabilities expose the new scatter size properties", () => {
  const capabilities = JSON.parse(
    readFileSync(new URL("../capabilities.json", import.meta.url), "utf8"),
  );
  const props = capabilities.objects.scatterProps.properties;
  assert.deepEqual(props.radiusMode.type, { enumeration: [] });
  assert.deepEqual(props.sizeScaleType.type, { enumeration: [] });
  assert.deepEqual(props.sizeMinPixels.type, { numeric: true });
  assert.deepEqual(props.sizeMaxPixels.type, { numeric: true });
});
