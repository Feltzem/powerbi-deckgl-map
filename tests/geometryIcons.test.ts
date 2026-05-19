import test from "node:test";
import assert from "node:assert/strict";

import { getGeometryIconHtml } from "../src/geometryIcons";

test("getGeometryIconHtml renders geometry icon classes and accessible labels", () => {
  const html = getGeometryIconHtml("path", "deckgl-gradient-legend__geometry-icon");

  assert.match(
    html,
    /class="deckgl-gradient-legend__geometry-icon deckgl-gradient-legend__geometry-icon--path"/,
  );
  assert.match(html, /aria-label="Path geometry"/);
  assert.match(html, /<title>Path geometry<\/title>/);
});
