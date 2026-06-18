import test from "node:test";
import assert from "node:assert/strict";

import { getTooltipPlacementStyle } from "../src/tooltipPlacement";

const bounds = { width: 400, height: 300 };

test("getTooltipPlacementStyle places top-left hovers below-right", () => {
  const style = getTooltipPlacementStyle({
    x: 40,
    y: 40,
    bounds,
    maxWidth: 340,
  });

  assert.equal(
    style.transform,
    "translate(40px, 40px) translate(0, 0) translate(12px, 12px)",
  );
  assert.equal(style.marginLeft, "0px");
  assert.equal(style.maxWidth, "340px");
  assert.equal(style.maxHeight, "240px");
});

test("getTooltipPlacementStyle places top-right hovers below-left", () => {
  const style = getTooltipPlacementStyle({
    x: 360,
    y: 40,
    bounds,
    maxWidth: 340,
  });

  assert.equal(
    style.transform,
    "translate(360px, 40px) translate(-100%, 0) translate(-12px, 12px)",
  );
  assert.equal(style.maxWidth, "340px");
  assert.equal(style.maxHeight, "240px");
});

test("getTooltipPlacementStyle places bottom-left hovers above-right", () => {
  const style = getTooltipPlacementStyle({
    x: 40,
    y: 260,
    bounds,
    maxWidth: 340,
  });

  assert.equal(
    style.transform,
    "translate(40px, 260px) translate(0, -100%) translate(12px, -12px)",
  );
  assert.equal(style.maxWidth, "340px");
  assert.equal(style.maxHeight, "240px");
});

test("getTooltipPlacementStyle places bottom-right hovers above-left", () => {
  const style = getTooltipPlacementStyle({
    x: 360,
    y: 260,
    bounds,
    maxWidth: 340,
  });

  assert.equal(
    style.transform,
    "translate(360px, 260px) translate(-100%, -100%) translate(-12px, -12px)",
  );
  assert.equal(style.maxWidth, "340px");
  assert.equal(style.maxHeight, "240px");
});

test("getTooltipPlacementStyle uses the larger side near the center", () => {
  const style = getTooltipPlacementStyle({
    x: 240,
    y: 180,
    bounds: { width: 500, height: 400 },
    maxWidth: 340,
  });

  assert.equal(
    style.transform,
    "translate(240px, 180px) translate(0, 0) translate(12px, 12px)",
  );
  assert.equal(style.maxWidth, "240px");
  assert.equal(style.maxHeight, "200px");
});

test("getTooltipPlacementStyle falls back safely for invalid bounds", () => {
  const style = getTooltipPlacementStyle({
    x: 10,
    y: 20,
    bounds: { width: 0, height: 300 },
    maxWidth: 220,
  });

  assert.equal(
    style.transform,
    "translate(10px, 20px) translate(12px, 12px)",
  );
  assert.equal(style.marginLeft, "0px");
  assert.equal(style.maxWidth, "220px");
  assert.equal(style.maxHeight, undefined);
});
