import test from "node:test";
import assert from "node:assert/strict";
import type { PickingInfo } from "@deck.gl/core";

import {
  DEFAULT_LAYER_DRAW_ORDER,
  LAYER_IDS,
  getTemporalLayerId,
} from "../src/layerState";
import {
  MultipleObjectPicker,
  getAggregatedTooltipHtml,
} from "../src/tooltip";

const makePick = (
  layerId: string,
  id: string,
  tooltipHtml: string,
  index: number,
): PickingInfo =>
  ({
    x: 10,
    y: 20,
    index,
    layer: { id: layerId },
    object: {
      id,
      tooltipHtml,
    },
  }) as PickingInfo;

const makeGeoJsonPropertiesPick = (
  layerId: string,
  id: string,
  tooltipHtml: string,
): PickingInfo =>
  ({
    x: 10,
    y: 20,
    index: 0,
    layer: { id: layerId },
    object: {
      properties: {
        id,
        tooltipHtml,
      },
    },
  }) as PickingInfo;

test("getAggregatedTooltipHtml orders, deduplicates, and decorates picked objects", () => {
  const scatterPick = makePick(
    LAYER_IDS.scatter,
    "scatter-1",
    "<strong>Scatter</strong><br>value",
    0,
  );
  const polygonPick = makePick(
    LAYER_IDS.polygon,
    "polygon-1",
    "<strong>Polygon</strong><br>value",
    1,
  );
  const picker: MultipleObjectPicker = {
    pickMultipleObjects: () => [scatterPick, scatterPick, polygonPick],
  };

  const html = getAggregatedTooltipHtml({
    hoverInfo: scatterPick,
    deckOverlay: picker,
    drawOrder: [...DEFAULT_LAYER_DRAW_ORDER],
    activeTypes: new Set(["scatter", "polygon"]),
    layerIds: [LAYER_IDS.scatter, LAYER_IDS.polygon],
  });

  assert.ok(html);
  assert.match(html, /<title>Polygon geometry<\/title>/);
  assert.match(html, /<title>Scatter geometry<\/title>/);
  assert.equal((html.match(/data-geometry-id="scatter-1"/g) ?? []).length, 1);
  assert.ok(html.indexOf("Polygon") < html.indexOf("Scatter"));
});

test("getAggregatedTooltipHtml passes temporal layer ids to picker", () => {
  const temporalScatterId = getTemporalLayerId("scatter");
  const scatterPick = makePick(
    temporalScatterId,
    "scatter-1",
    "<strong>Scatter</strong>",
    0,
  );
  let requestedLayerIds: string[] | undefined;
  const picker: MultipleObjectPicker = {
    pickMultipleObjects: (params) => {
      requestedLayerIds = params.layerIds;
      return [scatterPick];
    },
  };

  const html = getAggregatedTooltipHtml({
    hoverInfo: scatterPick,
    deckOverlay: picker,
    drawOrder: [...DEFAULT_LAYER_DRAW_ORDER],
    activeTypes: new Set(["scatter"]),
    layerIds: [temporalScatterId],
  });

  assert.ok(html);
  assert.deepEqual(requestedLayerIds, [temporalScatterId]);
});

test("getAggregatedTooltipHtml reads GeoJSON feature properties", () => {
  const polygonPick = makeGeoJsonPropertiesPick(
    `${LAYER_IDS.polygon}-polygons-fill`,
    "restriction-1",
    "<strong>Restriction</strong><br>value",
  );

  const html = getAggregatedTooltipHtml({
    hoverInfo: polygonPick,
    deckOverlay: null,
    drawOrder: [...DEFAULT_LAYER_DRAW_ORDER],
    activeTypes: new Set(["polygon"]),
    layerIds: [LAYER_IDS.polygon],
  });

  assert.ok(html);
  assert.match(html, /Restriction/);
  assert.match(html, /data-geometry-id="restriction-1"/);
});
