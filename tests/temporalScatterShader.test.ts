import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// TemporalScatterLayer transforms the ScatterSymbolLayer vertex/fragment shader
// by string substitution against fixed anchors. If those anchors drift in the
// base layer, the transform throws at runtime (replaceOrThrow). This test pins
// the anchors at the source level so the drift is caught in CI without a WebGL
// context, where the layer cannot actually be constructed.

const here = dirname(fileURLToPath(import.meta.url));
const scatterSymbolSource = readFileSync(
  join(here, "..", "src", "layers", "scatterSymbolLayer.ts"),
  "utf8",
);

test("base scatter symbol shader still contains the temporal layer anchors", () => {
  assert.ok(
    scatterSymbolSource.includes("void main(void) {"),
    "main entry anchor missing",
  );
  assert.match(
    scatterSymbolSource,
    /project_position_to_clipspace\(\s*instancePositions,\s*instancePositions64Low,/,
    "projection call anchor missing or changed",
  );
  assert.ok(
    scatterSymbolSource.includes("geometry.worldPosition = instancePositions;"),
    "worldPosition anchor missing",
  );
});
