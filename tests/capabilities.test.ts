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

test("feature label roles have the expected kinds and preferred types", () => {
  assert.equal(getDataRole("featureLabel")?.kind, "GroupingOrMeasure");
  assert.deepEqual(getDataRole("featureLabel")?.preferredTypes, [
    { text: true },
  ]);
  assert.equal(getDataRole("labelPriority")?.kind, "Measure");
  assert.deepEqual(getDataRole("labelPriority")?.preferredTypes, [
    { numeric: true },
  ]);
});

test("both categorical mappings bind label roles and expose label settings", () => {
  assert.equal(capabilities.dataViewMappings.length, 2);
  for (const mapping of capabilities.dataViewMappings) {
    const categoryBindings = mapping.categorical?.categories?.select ?? [];
    const valueBindings = mapping.categorical?.values?.select ?? [];
    assert.ok(
      categoryBindings.some(
        (selection: { bind?: { to?: string } }) =>
          selection.bind?.to === "featureLabel",
      ),
    );
    assert.ok(
      valueBindings.some(
        (selection: { bind?: { to?: string } }) =>
          selection.bind?.to === "labelPriority",
      ),
    );
  }

  assert.ok(getObjectProperty("labelProps", "showLabels"));
  assert.ok(getObjectProperty("labelProps", "placement"));
  assert.ok(getObjectProperty("labelProps", "showShadow"));
  assert.ok(getObjectProperty("labelProps", "showGlow"));
});

test("map properties include satellite basemap settings", () => {
  assert.deepEqual(getObjectProperty("mapProps", "mapboxAccessToken")?.type, {
    text: true,
  });
  assert.deepEqual(
    getObjectProperty("mapProps", "aerialBasemapOpacity")?.type,
    {
      numeric: true,
    },
  );
});

test("web access privileges include satellite tile hosts", () => {
  const webAccess = capabilities.privileges.find(
    (privilege: { name?: string }) => privilege.name === "WebAccess",
  );

  assert.ok(webAccess?.parameters.includes("https://server.arcgisonline.com"));
  assert.ok(webAccess?.parameters.includes("https://api.mapbox.com"));
});
