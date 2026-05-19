import test from "node:test";
import assert from "node:assert/strict";
import powerbi from "powerbi-visuals-api";

import { createDatasetSnapshot } from "../src/mapper";
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

const makeCategory = (
  roleName: string,
  values: powerbi.PrimitiveValue[],
  displayName = roleName,
): powerbi.DataViewCategoryColumn => ({
  source: {
    displayName,
    roles: { [roleName]: true },
  },
  values,
});

const makeUnroledCategory = (
  values: powerbi.PrimitiveValue[],
  displayName: string,
  queryName?: string,
): powerbi.DataViewCategoryColumn => ({
  source: {
    displayName,
    queryName,
  },
  values,
});

const makeColumn = (
  roleName: string,
  values: powerbi.PrimitiveValue[],
  displayName = roleName,
): powerbi.DataViewValueColumn => ({
  source: {
    displayName,
    roles: { [roleName]: true },
  },
  values,
});

const makeValues = (
  groups: powerbi.DataViewValueColumnGroup[],
  source?: powerbi.DataViewMetadataColumn,
  extraColumns: powerbi.DataViewValueColumn[] = [],
): powerbi.DataViewValueColumns => {
  const values = [...groups.flatMap((group) => group.values), ...extraColumns] as unknown as
    powerbi.DataViewValueColumns;
  values.source = source;
  values.grouped = () => groups;
  return values;
};

const makeHost = (warnings: string[]): powerbi.extensibility.visual.IVisualHost =>
  ({
    displayWarningIcon: (title: string, detail?: string) => {
      warnings.push([title, detail].filter(Boolean).join(": "));
    },
    createSelectionIdBuilder: () => ({
      withCategory: (_category: unknown, index: number) => ({
        createSelectionId: () => ({
          getKey: () => `selection-${index}`,
        }),
      }),
    }),
  }) as powerbi.extensibility.visual.IVisualHost;

test("createDatasetSnapshot infers grouped path rows with missing layer types", () => {
  const ids = ["road-1", "road-2", "road-3", "road-4", "road-5"];
  const wkts = [
    "LINESTRING (175 -37.8, 175.001 -37.799)",
    "LINESTRING (175.002 -37.8, 175.003 -37.799)",
    "LINESTRING (175.004 -37.8, 175.005 -37.799)",
    "LINESTRING (175.006 -37.8, 175.007 -37.799)",
    "LINESTRING (175.008 -37.8, 175.009 -37.799)",
  ];
  const groups: powerbi.DataViewValueColumnGroup[] = [
    {
      name: "sealed",
      values: [
        makeColumn("layerType", ["path", null, null, null, null]),
        makeColumn("wkt", [wkts[0], wkts[1], null, null, null]),
        makeColumn("pathColor", ["sealed", null, null, null, null]),
      ],
    },
    {
      name: "metalled",
      values: [
        makeColumn("layerType", [null, null, null, null, null]),
        makeColumn("wkt", [null, null, wkts[2], null, null]),
        makeColumn("pathColor", [null, null, "metalled", null, null]),
      ],
    },
    {
      name: "unmetalled",
      values: [
        makeColumn("layerType", [null, null, null, null, null]),
        makeColumn("wkt", [null, null, null, wkts[3], null]),
        makeColumn("pathColor", [null, null, null, null, null]),
      ],
    },
    {
      name: null,
      values: [
        makeColumn("layerType", [null, null, null, null, null]),
        makeColumn("wkt", [null, null, null, null, wkts[4]]),
        makeColumn("pathColor", [null, null, null, null, null]),
      ],
    },
  ];
  const warnings: string[] = [];
  const settings = new VisualFormattingSettingsModel();
  const options = {
    dataViews: [
      {
        categorical: {
          categories: [makeCategory("geometryId", ids, "geometry_id")],
          values: makeValues(groups, {
            displayName: "road_surface",
            roles: { pathColor: true },
          }),
        },
        metadata: {},
      },
    ],
  } as powerbi.extensibility.visual.VisualUpdateOptions;

  const snapshot = createDatasetSnapshot(
    options,
    settings,
    makeHost(warnings),
    new Map(),
    "test",
  );
  const categoriesById = new Map(
    snapshot.layers.path.map((feature) => [
      feature.id,
      feature.properties.lineColorCategory,
    ]),
  );

  assert.deepEqual(warnings, []);
  assert.equal(snapshot.layers.path.length, ids.length);
  assert.equal(categoriesById.get("road-1"), "sealed");
  assert.equal(categoriesById.get("road-2"), "sealed");
  assert.equal(categoriesById.get("road-3"), "metalled");
  assert.equal(categoriesById.get("road-4"), "unmetalled");
  assert.equal(categoriesById.get("road-5"), null);
  assert.deepEqual(snapshot.colorRoles.pathColor.categoryOrder, [
    "sealed",
    "metalled",
    "unmetalled",
  ]);
  assert.equal(snapshot.colorRoles.pathColor.categoryCounts.get("sealed"), 2);
});

test("createDatasetSnapshot coalesces sparse grouped role candidates by row", () => {
  const ids = ["road-1", "road-2"];
  const wkts = [
    "LINESTRING (175 -37.8, 175.001 -37.799)",
    "LINESTRING (175.002 -37.8, 175.003 -37.799)",
  ];
  const groups: powerbi.DataViewValueColumnGroup[] = [
    {
      name: "sealed",
      values: [
        makeColumn("layerType", ["path", null]),
        makeColumn("wkt", [wkts[0], null]),
        makeColumn("pathColor", ["sealed", null]),
      ],
    },
  ];
  const warnings: string[] = [];
  const settings = new VisualFormattingSettingsModel();
  const options = {
    dataViews: [
      {
        categorical: {
          categories: [makeCategory("geometryId", ids, "geometry_id")],
          values: makeValues(
            groups,
            {
              displayName: "road_surface",
              roles: { pathColor: true },
            },
            [
              makeColumn("layerType", ["path", "path"]),
              makeColumn("wkt", wkts),
              makeColumn("pathColor", ["sealed", "sealed"]),
            ],
          ),
        },
        metadata: {},
      },
    ],
  } as powerbi.extensibility.visual.VisualUpdateOptions;

  const snapshot = createDatasetSnapshot(
    options,
    settings,
    makeHost(warnings),
    new Map(),
    "test",
  );

  assert.deepEqual(warnings, []);
  assert.equal(snapshot.layers.path.length, ids.length);
  assert.deepEqual(
    snapshot.layers.path.map((feature) => feature.properties.lineColorCategory),
    ["sealed", "sealed"],
  );
});

test("createDatasetSnapshot falls back to bound path color values when group membership is partial", () => {
  const ids = ["road-1", "road-2", "road-3"];
  const wkts = [
    "LINESTRING (175 -37.8, 175.001 -37.799)",
    "LINESTRING (175.002 -37.8, 175.003 -37.799)",
    "LINESTRING (175.004 -37.8, 175.005 -37.799)",
  ];
  const groups: powerbi.DataViewValueColumnGroup[] = [
    {
      name: "sealed",
      values: [
        makeColumn("layerType", ["path", null, null]),
        makeColumn("wkt", [wkts[0], null, null]),
      ],
    },
    {
      name: "metalled",
      values: [
        makeColumn("layerType", [null, null, null]),
        makeColumn("wkt", [null, null, null]),
      ],
    },
    {
      name: "unmetalled",
      values: [
        makeColumn("layerType", [null, null, "path"]),
        makeColumn("wkt", [null, null, wkts[2]]),
      ],
    },
  ];
  const warnings: string[] = [];
  const settings = new VisualFormattingSettingsModel();
  const options = {
    dataViews: [
      {
        categorical: {
          categories: [makeCategory("geometryId", ids, "geometry_id")],
          values: makeValues(
            groups,
            {
              displayName: "road_surface",
              roles: { pathColor: true },
            },
            [
              makeColumn("layerType", ["path", "path", "path"]),
              makeColumn("wkt", wkts),
              makeColumn("pathColor", ["sealed", "metalled", "unmetalled"]),
            ],
          ),
        },
        metadata: {},
      },
    ],
  } as powerbi.extensibility.visual.VisualUpdateOptions;

  const snapshot = createDatasetSnapshot(
    options,
    settings,
    makeHost(warnings),
    new Map(),
    "test",
  );

  assert.deepEqual(warnings, []);
  assert.equal(snapshot.layers.path.length, ids.length);
  assert.deepEqual(
    snapshot.layers.path.map((feature) => feature.properties.lineColorCategory),
    ["sealed", "metalled", "unmetalled"],
  );
  assert.deepEqual(snapshot.colorRoles.pathColor.categoryOrder, [
    "sealed",
    "metalled",
    "unmetalled",
  ]);
});

test("createDatasetSnapshot prefers matching category values for grouped path colors", () => {
  const ids = ["road-1", "road-2", "road-3"];
  const surfaces = ["sealed", "metalled", "unmetalled"];
  const wkts = [
    "LINESTRING (175 -37.8, 175.001 -37.799)",
    "LINESTRING (175.002 -37.8, 175.003 -37.799)",
    "LINESTRING (175.004 -37.8, 175.005 -37.799)",
  ];
  const groups: powerbi.DataViewValueColumnGroup[] = [
    {
      name: "sealed",
      values: [
        makeColumn("layerType", ["path", null, null]),
        makeColumn("wkt", [wkts[0], null, null]),
      ],
    },
    {
      name: "metalled",
      values: [
        makeColumn("layerType", [null, null, null]),
        makeColumn("wkt", [null, null, null]),
      ],
    },
    {
      name: "unmetalled",
      values: [
        makeColumn("layerType", [null, null, "path"]),
        makeColumn("wkt", [null, null, wkts[2]]),
      ],
    },
  ];
  const warnings: string[] = [];
  const settings = new VisualFormattingSettingsModel();
  const options = {
    dataViews: [
      {
        categorical: {
          categories: [
            makeCategory("geometryId", ids, "geometry_id"),
            makeUnroledCategory(
              surfaces,
              "Road Surface",
              "hamilton_road_path.road_surface",
            ),
          ],
          values: makeValues(
            groups,
            {
              displayName: "road_surface",
              roles: { pathColor: true },
            },
            [
              makeColumn("layerType", ["path", "path", "path"]),
              makeColumn("wkt", wkts),
            ],
          ),
        },
        metadata: {},
      },
    ],
  } as powerbi.extensibility.visual.VisualUpdateOptions;

  const snapshot = createDatasetSnapshot(
    options,
    settings,
    makeHost(warnings),
    new Map(),
    "test",
  );

  assert.deepEqual(warnings, []);
  assert.equal(snapshot.layers.path.length, ids.length);
  assert.deepEqual(
    snapshot.layers.path.map((feature) => feature.properties.lineColorCategory),
    surfaces,
  );
  assert.deepEqual(snapshot.colorRoles.pathColor.categoryOrder, surfaces);
});

test("createDatasetSnapshot uses path color category values directly", () => {
  const ids = ["road-1", "road-2", "road-3"];
  const categories = ["sealed", "metalled", "unmetalled"];
  const wkts = [
    "LINESTRING (175 -37.8, 175.001 -37.799)",
    "LINESTRING (175.002 -37.8, 175.003 -37.799)",
    "LINESTRING (175.004 -37.8, 175.005 -37.799)",
  ];
  const warnings: string[] = [];
  const settings = new VisualFormattingSettingsModel();
  const options = {
    dataViews: [
      {
        categorical: {
          categories: [
            makeCategory("geometryId", ids, "geometry_id"),
            makeCategory("pathColor", categories, "road_surface"),
          ],
          values: makeValues([], undefined, [
            makeColumn("layerType", ["path", "path", "path"]),
            makeColumn("wkt", wkts),
          ]),
        },
        metadata: {},
      },
    ],
  } as powerbi.extensibility.visual.VisualUpdateOptions;

  const snapshot = createDatasetSnapshot(
    options,
    settings,
    makeHost(warnings),
    new Map(),
    "test",
  );

  assert.deepEqual(warnings, []);
  assert.equal(snapshot.layers.path.length, ids.length);
  assert.deepEqual(
    snapshot.layers.path.map((feature) => feature.properties.lineColorCategory),
    categories,
  );
  assert.deepEqual(snapshot.colorRoles.pathColor.categoryOrder, categories);
});

test("createDatasetSnapshot keeps numeric path color category values numeric", () => {
  const ids = ["road-1", "road-2"];
  const wkts = [
    "LINESTRING (175 -37.8, 175.001 -37.799)",
    "LINESTRING (175.002 -37.8, 175.003 -37.799)",
  ];
  const warnings: string[] = [];
  const settings = new VisualFormattingSettingsModel();
  const options = {
    dataViews: [
      {
        categorical: {
          categories: [
            makeCategory("geometryId", ids, "geometry_id"),
            makeCategory("pathColor", [10, 20], "road_density"),
          ],
          values: makeValues([], undefined, [
            makeColumn("layerType", ["path", "path"]),
            makeColumn("wkt", wkts),
          ]),
        },
        metadata: {},
      },
    ],
  } as powerbi.extensibility.visual.VisualUpdateOptions;

  const snapshot = createDatasetSnapshot(
    options,
    settings,
    makeHost(warnings),
    new Map(),
    "test",
  );

  assert.deepEqual(warnings, []);
  assert.equal(snapshot.layers.path.length, ids.length);
  assert.deepEqual(
    snapshot.layers.path.map((feature) => feature.properties.lineColorValue),
    [10, 20],
  );
  assert.equal(snapshot.colorRoles.pathColor.hasNumericColor, true);
  assert.equal(snapshot.colorRoles.pathColor.hasCategoricalColor, false);
});
