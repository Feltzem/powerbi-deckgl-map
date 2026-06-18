import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const capabilities = JSON.parse(
  readFileSync(new URL("../capabilities.json", import.meta.url), "utf8"),
);

const getDataRole = (name: string) =>
  capabilities.dataRoles.find(
    (dataRole: { name?: string }) => dataRole.name === name,
  );

test("timestamp role documents datetime support and prefers numeric values", () => {
  const role = getDataRole("timestamp");

  assert.equal(role?.kind, "GroupingOrMeasure");
  assert.match(role?.description ?? "", /datetime/);
  assert.deepEqual(role?.preferredTypes, [{ numeric: true }]);
});

test("polygon extrusion role prefers numeric values", () => {
  const role = getDataRole("polygonExtrudeElevation");

  assert.equal(role?.kind, "Measure");
  assert.deepEqual(role?.preferredTypes, [{ numeric: true }]);
});
