import test from "node:test";
import assert from "node:assert/strict";
import powerbi from "powerbi-visuals-api";

import { InputLayerType, OurData, RowValueAvailability, RowValues } from "../src/dataTypes";
import { parseLine } from "../src/parsers/lineArc";
import { parsePolygon } from "../src/parsers/polygon";
import { parseScatter } from "../src/parsers/scatter";

const makeAvailability = (
  enabled: Array<keyof RowValues>,
): RowValueAvailability => {
  const availability = Object.fromEntries(
    Object.keys(makeRow()).map((key) => [key, false]),
  ) as RowValueAvailability;
  for (const key of enabled) {
    availability[key] = true;
  }
  return availability;
};

const makeRow = (overrides: Partial<RowValues> = {}): RowValues => ({
  geometryId: "geometry-1",
  layerType: null,
  wkp: null,
  wkt: null,
  point1Latitude: null,
  point1Longitude: null,
  point2Latitude: null,
  point2Longitude: null,
  scatterRadius: null,
  scatterElevation: null,
  heatmapWeight: null,
  scatterLineColor: null,
  scatterLineWidth: null,
  scatterFillColor: null,
  lineLineWidth: null,
  lineLineColor: null,
  pathWidth: null,
  pathColor: null,
  polygonLineColor: null,
  polygonLineWidth: null,
  polygonFillColor: null,
  polygonExtrudeElevation: null,
  arcLineWidth: null,
  arcSourceColor: null,
  arcTargetColor: null,
  tooltip: null,
  timestamp: null,
  ...overrides,
});

const makeData = (): OurData => ({
  id: "geometry-1",
  type: null,
  lineData: null,
  lineProperties: null,
  scatterData: null,
  scatterProperties: null,
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

test("parseScatter accepts finite coordinates", () => {
  const rowValues = makeRow({
    point1Latitude: "-37.8",
    point1Longitude: "175.2",
    scatterRadius: "10",
  });
  const data = makeData();
  const errors: string[] = [];

  assert.equal(
    parseScatter(
      makeAvailability(["point1Latitude", "point1Longitude"]),
      rowValues,
      errors,
      data,
    ),
    true,
  );
  assert.equal(data.type, InputLayerType.Scatter);
  assert.deepEqual(data.scatterData, {
    lat: -37.8,
    lon: 175.2,
    radius: 10,
    elevation: null,
    heatmapWeight: null,
  });
  assert.deepEqual(errors, []);
});

test("parseScatter stores finite elevation and ignores invalid elevation", () => {
  const data = makeData();
  const errors: string[] = [];

  assert.equal(
    parseScatter(
      makeAvailability([
        "point1Latitude",
        "point1Longitude",
        "scatterElevation",
      ]),
      makeRow({
        point1Latitude: "-37.8",
        point1Longitude: "175.2",
        scatterElevation: "250.5",
      }),
      errors,
      data,
    ),
    true,
  );
  assert.equal(data.scatterData?.elevation, 250.5);

  const invalidData = makeData();
  assert.equal(
    parseScatter(
      makeAvailability([
        "point1Latitude",
        "point1Longitude",
        "scatterElevation",
      ]),
      makeRow({
        point1Latitude: "-37.8",
        point1Longitude: "175.2",
        scatterElevation: "not-a-number",
      }),
      errors,
      invalidData,
    ),
    true,
  );
  assert.equal(invalidData.scatterData?.elevation, null);
});

test("parseScatter stores positive heatmap weight and zeroes invalid bound weights", () => {
  const data = makeData();
  const errors: string[] = [];

  assert.equal(
    parseScatter(
      makeAvailability([
        "point1Latitude",
        "point1Longitude",
        "heatmapWeight",
      ]),
      makeRow({
        point1Latitude: "-37.8",
        point1Longitude: "175.2",
        heatmapWeight: "2.5",
      }),
      errors,
      data,
    ),
    true,
  );
  assert.equal(data.scatterData?.heatmapWeight, 2.5);

  const invalidData = makeData();
  assert.equal(
    parseScatter(
      makeAvailability([
        "point1Latitude",
        "point1Longitude",
        "heatmapWeight",
      ]),
      makeRow({
        point1Latitude: "-37.8",
        point1Longitude: "175.2",
        heatmapWeight: "-1",
      }),
      errors,
      invalidData,
    ),
    true,
  );
  assert.equal(invalidData.scatterData?.heatmapWeight, 0);
});

test("parseScatter rejects non-finite coordinates", () => {
  const rowValues = makeRow({
    point1Latitude: "not-a-number",
    point1Longitude: "175.2",
  });
  const errors: string[] = [];

  assert.equal(
    parseScatter(
      makeAvailability(["point1Latitude", "point1Longitude"]),
      rowValues,
      errors,
      makeData(),
    ),
    false,
  );
  assert.match(errors.join("\n"), /finite numbers/);
});

test("parseLine rejects blank coordinates even when the role is provided", () => {
  const rowValues = makeRow({
    point1Latitude: "-37.8",
    point1Longitude: "175.2",
    point2Latitude: "",
    point2Longitude: "175.3",
  });
  const errors: string[] = [];

  assert.equal(
    parseLine(
      makeAvailability([
        "point1Latitude",
        "point1Longitude",
        "point2Latitude",
        "point2Longitude",
      ]),
      rowValues,
      errors,
      makeData(),
    ),
    false,
  );
  assert.match(errors.join("\n"), /finite numbers/);
});

test("parsePolygon clamps invalid and negative extrusion heights", () => {
  const geometry = {
    type: "Polygon" as const,
    coordinates: [
      [
        [175, -37],
        [175.1, -37],
        [175.1, -37.1],
        [175, -37],
      ],
    ],
  };
  const errors: string[] = [];

  const positiveData = makeData();
  assert.equal(
    parsePolygon(
      geometry,
      null,
      makeRow({ polygonExtrudeElevation: "25.5" }),
      errors,
      positiveData,
    ),
    true,
  );
  assert.equal(positiveData.polygonProperties?.elevation, 25.5);

  const negativeData = makeData();
  assert.equal(
    parsePolygon(
      geometry,
      null,
      makeRow({ polygonExtrudeElevation: -10 }),
      errors,
      negativeData,
    ),
    true,
  );
  assert.equal(negativeData.polygonProperties?.elevation, 0);

  const invalidData = makeData();
  assert.equal(
    parsePolygon(
      geometry,
      null,
      makeRow({ polygonExtrudeElevation: "not-a-number" }),
      errors,
      invalidData,
    ),
    true,
  );
  assert.equal(invalidData.polygonProperties?.elevation, 0);
});
