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

const getObjectProperty = (objectName: string, propertyName: string) =>
  capabilities.objects?.[objectName]?.properties?.[propertyName];

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

test("map properties include satellite basemap settings", () => {
  assert.deepEqual(getObjectProperty("mapProps", "mapboxAccessToken")?.type, {
    text: true,
  });
  assert.deepEqual(getObjectProperty("mapProps", "aerialBasemapOpacity")?.type, {
    numeric: true,
  });
});

test("web access privileges include satellite tile hosts", () => {
  const webAccess = capabilities.privileges.find(
    (privilege: { name?: string }) => privilege.name === "WebAccess",
  );

  assert.ok(webAccess?.parameters.includes("https://server.arcgisonline.com"));
  assert.ok(webAccess?.parameters.includes("https://api.mapbox.com"));
});
