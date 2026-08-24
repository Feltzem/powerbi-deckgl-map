import test from "node:test";
import assert from "node:assert/strict";

import { ScatterplotLayer } from "@deck.gl/layers";
import { readFileSync } from "node:fs";
import powerbi from "powerbi-visuals-api";

import { createEmptyColorRoleStatsStore } from "../src/colorRoles";
import { InputLayerType, OurData } from "../src/dataTypes";
import getScatterLayer, { getScatterPosition } from "../src/layers/scatter";
import ScatterSymbolLayer from "../src/layers/scatterSymbolLayer";
import {
  defaultScatterSymbolType,
  getScatterSymbolType,
  scatterSymbolEntries,
  scatterSymbolItems,
} from "../src/scatterSymbols";
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

const expectedSymbolIds = [
  "circle",
  "square",
  "diamond",
  "triangle",
  "inverted-triangle",
  "hexagon",
  "pentagon",
  "star",
  "cross",
  "x-cross",
];

const makeScatterPoint = (): OurData => ({
  id: "point-1",
  labelText: null,
  labelPriority: null,
  sourceOrder: 0,
  type: InputLayerType.Scatter,
  lineData: null,
  lineProperties: null,
  scatterData: {
    lat: -37.8,
    lon: 175.2,
    radius: 25,
    elevation: null,
    heatmapWeight: null,
  },
  scatterProperties: {
    lineWidth: 4,
    lineColor: [5, 6, 7, 255],
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

const makeScatterLayer = (symbolType: string) => {
  const settings = new VisualFormattingSettingsModel();
  settings.scatter.symbolType.value = {
    value: symbolType,
    displayName: symbolType,
  };
  const colorRoles = createEmptyColorRoleStatsStore();
  colorRoles.scatterFillColor.hasTextColor = true;
  colorRoles.scatterLineColor.hasTextColor = true;

  return getScatterLayer(
    [makeScatterPoint()],
    settings.scatter,
    settings.highlighting,
    new Set(),
    "",
    colorRoles,
    new Map(),
    "test",
    () => undefined,
  );
};

const makeScatterLayerFromRawSymbolValue = (symbolType: unknown) => {
  const settings = new VisualFormattingSettingsModel();
  settings.scatter.symbolType.value =
    symbolType as typeof settings.scatter.symbolType.value;
  const colorRoles = createEmptyColorRoleStatsStore();
  colorRoles.scatterFillColor.hasTextColor = true;
  colorRoles.scatterLineColor.hasTextColor = true;

  return getScatterLayer(
    [makeScatterPoint()],
    settings.scatter,
    settings.highlighting,
    new Set(),
    "",
    colorRoles,
    new Map(),
    "test",
    () => undefined,
  );
};

test("scatter symbol registry exposes exactly the supported symbols", () => {
  assert.equal(defaultScatterSymbolType, "circle");
  assert.deepEqual(
    scatterSymbolEntries.map(([symbolType]) => symbolType),
    expectedSymbolIds,
  );
  assert.deepEqual(
    scatterSymbolItems.map((symbol) => symbol.value),
    expectedSymbolIds,
  );
  assert.equal(
    new Set(
      scatterSymbolEntries.map(([_symbolType, symbol]) => symbol.shaderValue),
    ).size,
    expectedSymbolIds.length,
  );
});

test("getScatterPosition uses explicit elevation when present", () => {
  const point = makeScatterPoint();
  point.scatterData!.elevation = 325;

  assert.deepEqual(getScatterPosition(point), [175.2, -37.8, 325]);
});

test("getScatterPosition keeps points near ground without elevation", () => {
  assert.deepEqual(getScatterPosition(makeScatterPoint()), [175.2, -37.8, 0.1]);
});

test("scatter symbol lookup falls back to circle for invalid settings", () => {
  assert.equal(getScatterSymbolType("diamond"), "diamond");
  assert.equal(getScatterSymbolType("Diamond"), "diamond");
  assert.equal(getScatterSymbolType("X cross"), "x-cross");
  assert.equal(
    getScatterSymbolType({ value: "diamond", displayName: "Diamond" }),
    "diamond",
  );
  assert.equal(getScatterSymbolType({ displayName: "Diamond" }), "diamond");
  assert.equal(
    getScatterSymbolType({
      value: { value: "diamond", displayName: "Diamond" },
      displayName: "Diamond",
    }),
    "diamond",
  );
  assert.equal(getScatterSymbolType("not-a-symbol"), "circle");
  assert.equal(getScatterSymbolType(null), "circle");
});

test("capabilities exposes scatter symbolType as a format enumeration", () => {
  const capabilities = JSON.parse(
    readFileSync(new URL("../capabilities.json", import.meta.url), "utf8"),
  );

  assert.deepEqual(
    capabilities.objects.scatterProps.properties.symbolType.type,
    { enumeration: [] },
  );
});

test("capabilities exposes scatter elevation as a numeric data role", () => {
  const capabilities = JSON.parse(
    readFileSync(new URL("../capabilities.json", import.meta.url), "utf8"),
  );
  const role = capabilities.dataRoles.find(
    (dataRole: { name?: string }) => dataRole.name === "scatterElevation",
  );

  assert.equal(role?.displayName, "Scatter elevation (m)");
  assert.equal(role?.kind, "Measure");
  assert.equal(role?.preferredTypes?.[0]?.numeric, true);
});

test("getScatterLayer keeps circle on ScatterplotLayer", () => {
  const layer = makeScatterLayer("circle");

  assert.ok(layer instanceof ScatterplotLayer);
});

test("getScatterLayer uses ScatterSymbolLayer for non-circle symbols", () => {
  const point = makeScatterPoint();
  const layer = makeScatterLayer("diamond");
  const props = layer.props as unknown as {
    symbolType: string;
    getRadius: (data: OurData) => number;
    getLineWidth: (data: OurData) => number;
    getFillColor: (data: OurData) => number[];
    getLineColor: (data: OurData) => number[];
  };

  assert.ok(layer instanceof ScatterSymbolLayer);
  assert.equal(props.symbolType, "diamond");
  assert.equal(props.getRadius(point), 25);
  assert.equal(props.getLineWidth(point), 4);
  assert.deepEqual(props.getFillColor(point), [1, 2, 3, 255]);
  assert.deepEqual(props.getLineColor(point), [5, 6, 7, 255]);
});

test("getScatterLayer accepts display-name symbol values", () => {
  const layer = makeScatterLayerFromRawSymbolValue("Triangle");
  const props = layer.props as unknown as { symbolType: string };

  assert.ok(layer instanceof ScatterSymbolLayer);
  assert.equal(props.symbolType, "triangle");
});

test("getScatterLayer falls back to ScatterplotLayer for invalid symbol settings", () => {
  const layer = makeScatterLayer("not-a-symbol");

  assert.ok(layer instanceof ScatterplotLayer);
});
