import test from "node:test";
import assert from "node:assert/strict";

import {
  clearLabelDataCache,
  getLabelLayout,
  getLabelPosition,
  isLabelVisibleAtTime,
  prepareLabelData,
} from "../src/labels/labelData";
import { InputLayerType, OurData } from "../src/dataTypes";
import {
  LABEL_PLACEMENT_ITEMS,
  VisualFormattingSettingsModel,
} from "../src/settings";

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

const makePoint = (
  id: string,
  labelText: string | null,
  sourceOrder: number,
  timestampSeconds: number | null,
): OurData =>
  ({
    id,
    labelText,
    labelPriority: sourceOrder,
    sourceOrder,
    type: InputLayerType.Scatter,
    scatterData: {
      lon: sourceOrder,
      lat: sourceOrder + 1,
      elevation: null,
      radius: null,
      heatmapWeight: null,
    },
    timestampSeconds,
    isTemporal: true,
  }) as unknown as OurData;

test("prepareLabelData filters blanks, caches by source identity, and keeps priority order data", () => {
  clearLabelDataCache();
  const source = [
    makePoint("a", " Alpha ", 4, null),
    makePoint("blank", "   ", 5, null),
    makePoint("b", "Bravo", 6, null),
  ];

  const first = prepareLabelData(source, "version-1");
  const second = prepareLabelData(source, "version-1");

  assert.equal(first, second);
  assert.deepEqual(
    first.map((datum) => [
      datum.id,
      datum.text,
      datum.priority,
      datum.sourceOrder,
    ]),
    [
      ["a", " Alpha ", 4, 4],
      ["b", "Bravo", 6, 6],
    ],
  );
});

test("timestamped labels follow the animation window and derive height", () => {
  const datum = prepareLabelData(
    [makePoint("timed", "Timed", 0, 150)],
    "version-2",
  )[0];
  assert.ok(datum);

  assert.equal(isLabelVisibleAtTime(datum, 125, 100, 10), false);
  assert.equal(isLabelVisibleAtTime(datum, 155, 100, 10), true);
  assert.equal(isLabelVisibleAtTime(datum, 170, 100, 10), false);
  assert.deepEqual(getLabelPosition(datum, 150, 100, 500, 200), [0, 1, 125]);
  assert.deepEqual(getLabelPosition(datum, null, 100, 500, 200), [0, 1, 0.1]);

  const staticDatum = { ...datum, isTemporal: false };
  assert.equal(isLabelVisibleAtTime(staticDatum, 125, 100, 10), true);
  assert.deepEqual(
    getLabelPosition(staticDatum, 150, 100, 500, 200),
    [0, 1, 0.1],
  );
});

test("label placements anchor away from the feature and clear it by a gap", () => {
  const settings = new VisualFormattingSettingsModel().labels;
  settings.showBox.value = false;

  const layouts = LABEL_PLACEMENT_ITEMS.map((item) => {
    settings.placement.value = { ...item };
    const layout = getLabelLayout(settings);
    return [
      item.value,
      layout.textAnchor,
      layout.alignmentBaseline,
      layout.pixelOffset,
    ];
  });

  assert.deepEqual(layouts, [
    ["top-left", "end", "bottom", [-4, -4]],
    ["top-center", "middle", "bottom", [0, -4]],
    ["top-right", "start", "bottom", [4, -4]],
    ["middle-left", "end", "center", [-4, 0]],
    ["middle-center", "middle", "center", [0, 0]],
    ["middle-right", "start", "center", [4, 0]],
    ["bottom-left", "end", "top", [-4, 4]],
    ["bottom-center", "middle", "top", [0, 4]],
    ["bottom-right", "start", "top", [4, 4]],
  ]);
});

test("the placement gap grows with the background box and honors manual offsets", () => {
  const settings = new VisualFormattingSettingsModel().labels;
  settings.placement.value = { ...LABEL_PLACEMENT_ITEMS[0] };
  settings.showBox.value = true;
  settings.boxPadding.value = 6;
  settings.borderWidth.value = 2;
  settings.offsetX.value = 10;
  settings.offsetY.value = -3;

  assert.deepEqual(getLabelLayout(settings).pixelOffset, [-2, -15]);
});
