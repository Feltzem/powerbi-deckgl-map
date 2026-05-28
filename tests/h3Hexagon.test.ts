import test from "node:test";
import assert from "node:assert/strict";

import {
  aggregateScatterToH3Cells,
  H3_HEXAGON_OUTLINE_COLOR,
  getH3CountColor,
  getH3CountOpacity,
  getH3OutlineColor,
  getH3HexagonTooltipHtml,
  default as getH3HexagonLayer,
} from "../src/layers/h3Hexagon";
import { OurData } from "../src/dataTypes";
import { createEmptyLayerDataStore } from "../src/dataTypes";
import { getGradientLegendSpecs } from "../src/gradientLegend";
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

let pointIdCounter = 0;

const makeScatterPoint = (lat: number, lon: number): OurData =>
  ({
    id: `${lat}:${lon}:${pointIdCounter++}`,
    scatterData: {
      lat,
      lon,
      radius: null,
      heatmapWeight: null,
    },
  }) as OurData;

test("aggregateScatterToH3Cells groups scatter points by H3 cell", () => {
  const cells = aggregateScatterToH3Cells(
    [
      makeScatterPoint(-37.8, 175.2),
      makeScatterPoint(-37.8, 175.2),
    ],
    7,
  );

  assert.equal(cells.length, 1);
  assert.equal(cells[0].count, 2);
  assert.equal(typeof cells[0].hexagon, "string");
});

test("aggregateScatterToH3Cells returns separate occupied cells", () => {
  const cells = aggregateScatterToH3Cells(
    [
      makeScatterPoint(-37.8, 175.2),
      makeScatterPoint(40.7, -74.0),
    ],
    7,
  );

  assert.equal(cells.length, 2);
  assert.deepEqual(
    cells.map((cell) => cell.count).sort((left, right) => left - right),
    [1, 1],
  );
});

test("aggregateScatterToH3Cells ignores invalid scatter coordinates", () => {
  assert.deepEqual(
    aggregateScatterToH3Cells(
      [
        makeScatterPoint(91, 175.2),
        makeScatterPoint(-37.8, -181),
        {} as OurData,
      ],
      7,
    ),
    [],
  );
  assert.deepEqual(aggregateScatterToH3Cells([], 7), []);
});

test("getH3CountOpacity maps count classes to low and high opacity", () => {
  const bins = {
    minValue: 1,
    maxValue: 10,
    breaks: [1, 5, 10],
    classCount: 2,
  };

  assert.equal(getH3CountOpacity(1, bins, 20, 220), 20);
  assert.equal(getH3CountOpacity(10, bins, 20, 220), 220);
  assert.equal(
    getH3CountOpacity(
      3,
      { minValue: 3, maxValue: 3, breaks: [3, 3], classCount: 1 },
      20,
      220,
    ),
    220,
  );
});

test("getH3CountColor applies class color and count opacity", () => {
  const bins = {
    minValue: 1,
    maxValue: 10,
    breaks: [1, 5, 10],
    classCount: 2,
  };

  assert.deepEqual(
    getH3CountColor(
      10,
      bins,
      [
        [1, 2, 3, 255],
        [4, 5, 6, 255],
      ],
      20,
      220,
      [9, 9, 9, 255],
    ),
    [4, 5, 6, 220],
  );
  assert.deepEqual(
    getH3CountColor(10, null, [], 20, 123, [9, 9, 9, 255]),
    [9, 9, 9, 123],
  );
});

test("getH3OutlineColor keeps dark grey and applies count opacity", () => {
  const bins = {
    minValue: 1,
    maxValue: 10,
    breaks: [1, 5, 10],
    classCount: 2,
  };

  assert.deepEqual(getH3OutlineColor(1, bins, 20, 220), [
    H3_HEXAGON_OUTLINE_COLOR[0],
    H3_HEXAGON_OUTLINE_COLOR[1],
    H3_HEXAGON_OUTLINE_COLOR[2],
    20,
  ]);
  assert.deepEqual(getH3OutlineColor(10, bins, 20, 220), [
    H3_HEXAGON_OUTLINE_COLOR[0],
    H3_HEXAGON_OUTLINE_COLOR[1],
    H3_HEXAGON_OUTLINE_COLOR[2],
    220,
  ]);
});

test("getGradientLegendSpecs includes H3 count legends when enabled", () => {
  const settings = new VisualFormattingSettingsModel();
  settings.h3Hexagon.showH3Hexagons.value = true;
  settings.h3Hexagon.fillGradient.classCount.value = 2;
  const layerData = createEmptyLayerDataStore();
  layerData.scatter.push(
    makeScatterPoint(-37.8, 175.2),
    makeScatterPoint(-37.8, 175.2),
    makeScatterPoint(-37.8, 175.2),
    makeScatterPoint(-37.8, 175.2),
    makeScatterPoint(40.7, -74.0),
  );
  const specs = getGradientLegendSpecs(
    layerData,
    settings,
    undefined,
    new Map(),
    "test",
  );

  assert.deepEqual(
    specs.map((spec) => spec.key),
    ["h3-fill"],
  );
  assert.deepEqual(
    specs.map((spec) => spec.title),
    ["H3 point count"],
  );
  assert.equal(specs[0].type, "numeric");
  assert.deepEqual(
    specs[0].type === "numeric"
      ? specs[0].classes.map((legendClass) => [
          legendClass.lowValue,
          legendClass.highValue,
        ])
      : [],
    [
      [1, 3],
      [3, 4],
    ],
  );
});

test("getH3HexagonLayer uses a fixed dark grey outline with count opacity", () => {
  const settings = new VisualFormattingSettingsModel();
  settings.h3Hexagon.lowFillOpacity.value = 20;
  settings.h3Hexagon.highFillOpacity.value = 220;
  const layer = getH3HexagonLayer(
    [makeScatterPoint(-37.8, 175.2)],
    settings.h3Hexagon,
    new Map(),
    "test",
  );
  const getLineColor = (
    layer as unknown as {
      props: { getLineColor: (cell: { count: number }) => number[] };
    }
  ).props.getLineColor;

  assert.deepEqual(getLineColor({ count: 1 }), [
    H3_HEXAGON_OUTLINE_COLOR[0],
    H3_HEXAGON_OUTLINE_COLOR[1],
    H3_HEXAGON_OUTLINE_COLOR[2],
    220,
  ]);
});

test("getH3HexagonTooltipHtml returns join count for H3 cells only", () => {
  assert.equal(
    getH3HexagonTooltipHtml({
      layer: { id: "h3-hexagon-layer-base-hexagon-cell" } as any,
      object: { hexagon: "872830828ffffff", count: 1234 },
    }),
    '<div class="deckgl-h3-tooltip"><strong>Join count</strong><br>1,234</div>',
  );
  assert.equal(
    getH3HexagonTooltipHtml({
      layer: { id: "scatterplot-layer-base" } as any,
      object: { count: 1234 },
    }),
    null,
  );
  assert.equal(
    getH3HexagonTooltipHtml({
      layer: { id: "h3-hexagon-layer-base" } as any,
      object: {},
    }),
    null,
  );
});
