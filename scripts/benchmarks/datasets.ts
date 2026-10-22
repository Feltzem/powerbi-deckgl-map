// Benchmark datasets shared by the Node and browser harnesses. Nothing here
// touches the filesystem or the DOM, so the same scenarios run in both.

export type CellValue = string | number | null;
export type ObjectValues = Record<string, Record<string, unknown>>;

export interface TableColumns {
  rowCount: number;
  columns: Record<string, CellValue[]>;
}

// Maps a visual data role to the source column that feeds it.
export type RoleBindings = Record<string, string>;

export interface ScenarioDataView {
  id: string;
  description: string;
  rowCount: number;
  options: any;
}

export const HAMILTON_TABLES = [
  "hamilton_cas_crash_point",
  "hamilton_geonet_earthquake_point",
  "hamilton_road_path",
  "hamilton_place_polygon",
  "hamilton_sa2_travel_to_work_od_2023_arc",
  "hamilton_ferry_route_line",
  "hamilton_nzta_traffic_count_site_point",
  "hamilton_multigeometry_road_density_map",
  "hamilton_sa2_consents_stacked",
] as const;

export type HamiltonTableName = (typeof HAMILTON_TABLES)[number];

const numericPattern = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") {
        rows.push(row);
      }
      row = [];
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
};

// Power BI types whole columns, so a column becomes numeric only when every
// non-blank cell is a number. Blank cells arrive as null.
export const csvToTable = (text: string): TableColumns => {
  const [header, ...body] = parseCsv(text);
  const columns: Record<string, CellValue[]> = {};

  header.forEach((name, columnIndex) => {
    const raw = body.map((row) => row[columnIndex] ?? "");
    const isNumeric = raw.every(
      (value) => value === "" || numericPattern.test(value),
    );
    columns[name] = raw.map((value) =>
      value === "" ? null : isNumeric ? Number(value) : value,
    );
  });

  return { rowCount: body.length, columns };
};

export const concatTables = (tables: TableColumns[]): TableColumns => {
  const names = new Set(tables.flatMap((table) => Object.keys(table.columns)));
  const columns: Record<string, CellValue[]> = {};
  for (const name of names) {
    columns[name] = tables.flatMap(
      (table) =>
        table.columns[name] ?? new Array<CellValue>(table.rowCount).fill(null),
    );
  }
  return {
    rowCount: tables.reduce((sum, table) => sum + table.rowCount, 0),
    columns,
  };
};

// Methods live on the prototype so the stub adds one small allocation per row
// and does not inflate the parse timings. Power BI's real selection IDs cost
// more than this, so parse timings here are a lower bound.
class SelectionIdStub {
  constructor(readonly key: string) {}
  getKey() {
    return this.key;
  }
  getSelector() {
    return { data: [{ key: this.key }] };
  }
  getSelectorsByColumn() {
    return {};
  }
  equals(other: { getKey?: () => string }) {
    return other?.getKey?.() === this.key;
  }
  includes(other: { getKey?: () => string }) {
    return other?.getKey?.() === this.key;
  }
  hasIdentity() {
    return true;
  }
}

class SelectionIdBuilderStub {
  private rowIndex = 0;
  withCategory(_category: unknown, index: number) {
    this.rowIndex = index;
    return this;
  }
  withMeasure() {
    return this;
  }
  withSeries() {
    return this;
  }
  createSelectionId() {
    return new SelectionIdStub(`row-${this.rowIndex}`);
  }
}

export const createMockHost = (
  overrides: Record<string, unknown> = {},
): any => ({
  displayWarningIcon: () => undefined,
  fetchMoreData: () => false,
  persistProperties: () => undefined,
  createLocalizationManager: () => ({
    getDisplayName: (key: string) => key,
  }),
  createSelectionManager: () => ({
    select: () => Promise.resolve([]),
    clear: () => Promise.resolve(),
    getSelectionIds: () => [],
    registerOnSelectCallback: () => undefined,
    hasSelection: () => false,
  }),
  createSelectionIdBuilder: () => new SelectionIdBuilderStub(),
  ...overrides,
});

// Power BI implements grouped() on every value column set and returns a single
// group when no series field is bound. Setting this to false drops grouped()
// to measure how much parse time that path costs.
export const dataViewShape = { singleGroup: true };

// Builds the categorical data view Power BI hands the visual: Geometry ID as
// the category, every other bound role as a value column, and a grouped()
// view with one group because no series field is bound.
export const buildUpdateOptions = (
  table: TableColumns,
  bindings: RoleBindings,
  objects: ObjectValues = {},
): any => {
  const geometryIdColumn = bindings.geometryId;
  const categoryValues = table.columns[geometryIdColumn].map((value, index) =>
    value === null ? `row-${index}` : String(value),
  );
  const category = {
    source: {
      displayName: geometryIdColumn,
      queryName: `Table.${geometryIdColumn}`,
      roles: { geometryId: true },
      index: 0,
    },
    values: categoryValues,
  };

  const valueColumns: any[] = Object.entries(bindings)
    .filter(([role]) => role !== "geometryId")
    .map(([role, columnName], index) => {
      const values = table.columns[columnName];
      if (!values) {
        throw new Error(`Missing column ${columnName} for role ${role}`);
      }
      return {
        source: {
          displayName: columnName,
          queryName: `Table.${columnName}#${role}`,
          roles: { [role]: true },
          index: index + 1,
        },
        values,
      };
    });
  if (dataViewShape.singleGroup) {
    (valueColumns as any).grouped = () => [{ values: valueColumns }];
  }

  return {
    type: 62,
    operationKind: 0,
    viewport: { width: 1280, height: 800 },
    viewMode: 0,
    editMode: 0,
    dataViews: [
      {
        metadata: {
          columns: [category.source, ...valueColumns.map((column) => column.source)],
          objects,
        },
        categorical: {
          categories: [category],
          values: valueColumns,
        },
      },
    ],
  };
};

// Every scenario sets a blank basemap and an instant camera move so renders
// are deterministic and no tile requests are attempted.
const baseObjects = (extra: ObjectValues = {}): ObjectValues => ({
  ...extra,
  mapProps: {
    baseMap: "blank",
    flyTo: true,
    flyToDuration: 0,
    ...(extra.mapProps ?? {}),
  },
});

export interface HamiltonScenarioSpec {
  id: string;
  description: string;
  tables: HamiltonTableName[];
  bindings: RoleBindings;
  objects: ObjectValues;
  animated?: boolean;
}

const crashBindings: RoleBindings = {
  geometryId: "geometry_id",
  layerType: "layer_type",
  point1Latitude: "point1_latitude",
  point1Longitude: "point1_longitude",
  scatterRadius: "scatter_radius",
  heatmapWeight: "heatmap_weight",
  scatterFillColor: "scatter_fill_color_hex",
  tooltipHtml: "tooltip_html",
};

export const HAMILTON_SCENARIOS: HamiltonScenarioSpec[] = [
  {
    id: "hamilton-crash-scatter",
    description: "CAS crashes, 31,704 scatter points, hex fill",
    tables: ["hamilton_cas_crash_point"],
    bindings: crashBindings,
    objects: baseObjects(),
  },
  {
    id: "hamilton-crash-heatmap",
    description: "CAS crashes as a weighted heatmap",
    tables: ["hamilton_cas_crash_point"],
    bindings: crashBindings,
    objects: baseObjects({
      heatmapProps: { showHeatmap: true, showScatterPoints: false },
    }),
  },
  {
    id: "hamilton-crash-h3",
    description: "CAS crashes aggregated to H3 resolution 8",
    tables: ["hamilton_cas_crash_point"],
    bindings: crashBindings,
    objects: baseObjects({
      h3HexagonProps: {
        showH3Hexagons: true,
        showScatterPoints: false,
        resolution: 8,
        fillGradientBinningMethod: "natural-breaks",
      },
    }),
  },
  {
    id: "hamilton-earthquake-animation",
    description: "GeoNet earthquakes, 20,326 timestamped points, looping trail",
    tables: ["hamilton_geonet_earthquake_point"],
    bindings: {
      geometryId: "geometry_id",
      layerType: "layer_type",
      point1Latitude: "point1_latitude",
      point1Longitude: "point1_longitude",
      scatterRadius: "scatter_radius",
      scatterFillColor: "scatter_fill_color_hex",
      timestamp: "timestamp",
      tooltipHtml: "tooltip_html",
    },
    objects: baseObjects({
      animationProps: {
        play: true,
        loop: true,
        speedMode: "duration",
        animationDuration: 30,
        trailLength: 15552000,
      },
      layerControls: { showTimeSlider: true },
    }),
    animated: true,
  },
  {
    id: "hamilton-road-path-categorical",
    description: "Road centrelines, 2,258 WKP paths, categorical surface",
    tables: ["hamilton_road_path"],
    bindings: {
      geometryId: "geometry_id",
      layerType: "layer_type",
      wkp: "wkp",
      pathWidth: "path_width_m",
      pathColor: "road_surface",
      tooltipHtml: "tooltip_html",
    },
    objects: baseObjects(),
  },
  {
    id: "hamilton-place-polygon-numeric",
    description: "SA2 places, WKP polygons, natural-breaks fill, extruded",
    tables: ["hamilton_place_polygon"],
    bindings: {
      geometryId: "geometry_id",
      layerType: "layer_type",
      wkp: "wkp",
      polygonFillColor: "polygon_fill_color_value",
      polygonLineColor: "polygon_line_color_hex",
      polygonLineWidth: "polygon_line_width_m",
      polygonExtrudeElevation: "polygon_extrude_elevation_m",
      tooltipHtml: "tooltip_html",
    },
    objects: baseObjects({
      polygonProps: {
        extruded: true,
        fillGradientBinningMethod: "natural-breaks",
      },
    }),
  },
  {
    id: "hamilton-od-arc-numeric",
    description: "Travel-to-work OD arcs, quantile source/target gradient",
    tables: ["hamilton_sa2_travel_to_work_od_2023_arc"],
    bindings: {
      geometryId: "geometry_id",
      layerType: "layer_type",
      point1Latitude: "point1_latitude",
      point1Longitude: "point1_longitude",
      point2Latitude: "point2_latitude",
      point2Longitude: "point2_longitude",
      arcLineWidth: "arc_line_width_m",
      arcSourceColor: "arc_source_color_value",
      arcTargetColor: "arc_target_color_value",
      tooltipHtml: "tooltip_html",
    },
    objects: baseObjects({
      arcProps: {
        sourceGradientBinningMethod: "quantile",
        targetGradientBinningMethod: "quantile",
      },
    }),
  },
  {
    id: "hamilton-ferry-line",
    description: "Ferry routes as straight lines, hex colour",
    tables: ["hamilton_ferry_route_line"],
    bindings: {
      geometryId: "geometry_id",
      layerType: "layer_type",
      point1Latitude: "point1_latitude",
      point1Longitude: "point1_longitude",
      point2Latitude: "point2_latitude",
      point2Longitude: "point2_longitude",
      lineLineWidth: "line_width_m",
      lineLineColor: "line_color_hex",
      tooltipHtml: "tooltip_html",
    },
    objects: baseObjects(),
  },
  {
    id: "hamilton-traffic-points",
    description: "NZTA count sites, numeric fill, layer type 'point'",
    tables: ["hamilton_nzta_traffic_count_site_point"],
    bindings: {
      geometryId: "geometry_id",
      layerType: "layer_type",
      point1Latitude: "latitude",
      point1Longitude: "longitude",
      scatterRadius: "point_radius_m",
      scatterFillColor: "point_fill_color_value",
      scatterLineColor: "point_line_color_hex",
      scatterLineWidth: "point_line_width_m",
      tooltipHtml: "tooltip_html",
    },
    objects: baseObjects({ scatterProps: { layerType: "point" } }),
  },
  {
    id: "hamilton-multigeometry",
    description: "Combined polygon + path + point table with feature labels",
    tables: ["hamilton_multigeometry_road_density_map"],
    bindings: {
      geometryId: "geometry_id",
      layerType: "layer_type",
      featureLabel: "feature_label",
      wkp: "wkp",
      point1Latitude: "point1_latitude",
      point1Longitude: "point1_longitude",
      polygonFillColor: "road_density_km_per_km2",
      polygonLineColor: "polygon_line_color_hex",
      polygonLineWidth: "polygon_line_width_m",
      pathWidth: "path_width_m",
      pathColor: "road_surface",
      scatterRadius: "point_radius_m",
      scatterFillColor: "point_fill_color_hex",
      tooltipHtml: "tooltip_html",
    },
    objects: baseObjects({
      scatterProps: { layerType: "point" },
      labelProps: { showLabels: true },
    }),
  },
  {
    id: "hamilton-stacked-prisms",
    description: "SA2 building consents, 340 POLYGON Z prisms, extruded",
    tables: ["hamilton_sa2_consents_stacked"],
    bindings: {
      geometryId: "geometry_id",
      layerType: "layer_type",
      wkt: "wkt",
      polygonFillColor: "polygon_fill_color_hex",
      polygonLineColor: "polygon_line_color_hex",
      polygonLineWidth: "polygon_line_width_m",
      polygonExtrudeElevation: "polygon_extrude_elevation_m",
      tooltipHtml: "tooltip_html",
    },
    objects: baseObjects(),
  },
];

export const buildHamiltonScenario = (
  spec: HamiltonScenarioSpec,
  tables: Record<string, TableColumns>,
): ScenarioDataView => {
  const table = concatTables(spec.tables.map((name) => tables[name]));
  return {
    id: spec.id,
    description: spec.description,
    rowCount: table.rowCount,
    options: buildUpdateOptions(table, spec.bindings, spec.objects),
  };
};

// Seeded PRNG so every run, machine, and before/after build sees identical data.
export const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export type SyntheticKind =
  | "scatter"
  | "line"
  | "arc"
  | "path"
  | "polygon"
  | "prism"
  | "mixed";

export type SyntheticGeometry = "wkt" | "wkp";
export type SyntheticColor = "numeric" | "categorical" | "hex";

export interface SyntheticSpec {
  kind: SyntheticKind;
  rows: number;
  geometry?: SyntheticGeometry;
  color: SyntheticColor;
  timestamps?: boolean;
  seed?: number;
}

export type WkpEncoder = (
  geometry: { type: string; coordinates: unknown },
  precision: number,
) => string;

const CATEGORY_LABELS = [
  "sealed",
  "metalled",
  "unmetalled",
  "chip seal",
  "concrete",
  "asphalt",
  "gravel",
  "boardwalk",
  "cycleway",
  "bridge",
  "tunnel",
  "ford",
];

const HEX_COLORS = Array.from({ length: 48 }, (_value, index) => {
  const channel = (offset: number) =>
    ((index * 53 + offset * 97) % 256).toString(16).padStart(2, "0");
  return `#${channel(1)}${channel(2)}${channel(3)}cc`;
});

const NZ_BOUNDS = { minLon: 166.5, maxLon: 178.5, minLat: -46.5, maxLat: -34.5 };
const TIME_START = 1577836800;
const TIME_SPAN = 5 * 365 * 24 * 3600;

const roundTo = (value: number, places: number): number => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

const toWkt = (type: string, coordinates: any, hasZ: boolean): string => {
  const point = (position: number[]) => position.join(" ");
  const ring = (positions: number[][]) => `(${positions.map(point).join(", ")})`;
  const z = hasZ ? " Z" : "";
  if (type === "LineString") {
    return `LINESTRING${z} ${ring(coordinates)}`;
  }
  if (type === "Polygon") {
    return `POLYGON${z} (${coordinates.map(ring).join(", ")})`;
  }
  throw new Error(`Unsupported WKT type ${type}`);
};

const colorValue = (
  color: SyntheticColor,
  random: () => number,
  index: number,
): CellValue => {
  if (color === "categorical") {
    return CATEGORY_LABELS[Math.floor(random() * CATEGORY_LABELS.length)];
  }
  if (color === "hex") {
    return HEX_COLORS[index % HEX_COLORS.length];
  }
  // Skewed and rounded so quantile and natural-breaks see realistic ties.
  return roundTo(Math.exp(random() * 6), 2);
};

const syntheticKindForRow = (kind: SyntheticKind, index: number) =>
  kind === "mixed"
    ? (["scatter", "line", "arc", "path", "polygon", "prism"] as const)[index % 6]
    : kind;

export const generateSyntheticTable = (
  spec: SyntheticSpec,
  encodeWkp?: WkpEncoder,
): { table: TableColumns; bindings: RoleBindings } => {
  const random = mulberry32(spec.seed ?? 20261022);
  const geometry = spec.geometry ?? "wkt";
  const rows = spec.rows;
  const column = () => new Array<CellValue>(rows).fill(null);
  const columns: Record<string, CellValue[]> = {
    geometry_id: column(),
    layer_type: column(),
    lat1: column(),
    lon1: column(),
    lat2: column(),
    lon2: column(),
    geometry: column(),
    width: column(),
    radius: column(),
    color: column(),
    line_color: column(),
    elevation: column(),
    timestamp: column(),
    tooltip: column(),
  };
  if (geometry === "wkp" && !encodeWkp) {
    throw new Error("WKP synthetic data needs a WKP encoder");
  }

  for (let index = 0; index < rows; index += 1) {
    const kind = syntheticKindForRow(spec.kind, index);
    const lon = NZ_BOUNDS.minLon + random() * (NZ_BOUNDS.maxLon - NZ_BOUNDS.minLon);
    const lat = NZ_BOUNDS.minLat + random() * (NZ_BOUNDS.maxLat - NZ_BOUNDS.minLat);
    const value = colorValue(spec.color, random, index);
    columns.geometry_id[index] = `${spec.kind}-${index}`;
    columns.layer_type[index] = kind === "prism" ? "polygon" : kind;
    columns.tooltip[index] = `<div><strong>${kind} ${index}</strong><br><span>value ${String(value)}</span></div>`;
    if (spec.timestamps && (kind === "scatter" || kind === "path")) {
      columns.timestamp[index] = TIME_START + Math.floor(random() * TIME_SPAN);
    }

    if (kind === "scatter" || kind === "line" || kind === "arc") {
      columns.lat1[index] = roundTo(lat, 6);
      columns.lon1[index] = roundTo(lon, 6);
      if (kind !== "scatter") {
        const reach = kind === "arc" ? 1.5 : 0.05;
        columns.lat2[index] = roundTo(lat + (random() - 0.5) * reach, 6);
        columns.lon2[index] = roundTo(lon + (random() - 0.5) * reach, 6);
      }
      columns.radius[index] = 20 + Math.floor(random() * 200);
      columns.width[index] = 1 + Math.floor(random() * 40);
      columns.color[index] = value;
      continue;
    }

    let type: string;
    let coordinates: any;
    let hasZ = false;
    if (kind === "path") {
      // Road-like polylines: 2-30 vertices, short steps with drift.
      const vertexCount = 2 + Math.floor(random() * random() * 29);
      let x = lon;
      let y = lat;
      let heading = random() * Math.PI * 2;
      coordinates = [];
      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        coordinates.push([roundTo(x, 6), roundTo(y, 6)]);
        heading += (random() - 0.5) * 0.8;
        const step = 0.0005 + random() * 0.002;
        x += Math.cos(heading) * step;
        y += Math.sin(heading) * step;
      }
      type = "LineString";
    } else if (kind === "polygon") {
      // Irregular parcels: 6-40 vertex rings, a few with a hole.
      const vertexCount = 6 + Math.floor(random() * random() * 35);
      const radius = 0.001 + random() * 0.01;
      const outer: number[][] = [];
      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        const angle = (vertex / vertexCount) * Math.PI * 2;
        const r = radius * (0.7 + random() * 0.3);
        outer.push([roundTo(lon + Math.cos(angle) * r, 6), roundTo(lat + Math.sin(angle) * r, 6)]);
      }
      outer.push(outer[0]);
      coordinates = [outer];
      if (random() < 0.1) {
        const hole = [0, 1, 2, 3].map((corner) => {
          const angle = (corner / 4) * Math.PI * 2;
          return [
            roundTo(lon + Math.cos(angle) * radius * 0.2, 6),
            roundTo(lat + Math.sin(angle) * radius * 0.2, 6),
          ];
        });
        hole.push(hole[0]);
        coordinates.push(hole.reverse());
      }
      type = "Polygon";
      columns.elevation[index] = Math.floor(random() * 500);
    } else {
      // Stacked prisms: rectangles whose ring Z is the floor base.
      const floor = index % 8;
      const size = 0.0015;
      const base = floor * 120;
      const x = roundTo(lon, 6);
      const y = roundTo(lat, 6);
      coordinates = [
        [
          [x, y, base],
          [roundTo(x + size, 6), y, base],
          [roundTo(x + size, 6), roundTo(y + size, 6), base],
          [x, roundTo(y + size, 6), base],
          [x, y, base],
        ],
      ];
      type = "Polygon";
      hasZ = true;
      columns.elevation[index] = 100;
    }

    columns.geometry[index] =
      geometry === "wkp"
        ? encodeWkp!({ type, coordinates }, 6)
        : toWkt(type, coordinates, hasZ);
    columns.width[index] = 2 + Math.floor(random() * 30);
    columns.color[index] = value;
    columns.line_color[index] = "#1a1a1aff";
  }

  const geometryRole = geometry === "wkp" ? "wkp" : "wkt";
  const kinds = new Set(
    Array.from({ length: Math.min(rows, 6) }, (_value, index) =>
      syntheticKindForRow(spec.kind, index),
    ),
  );
  const bindings: RoleBindings = {
    geometryId: "geometry_id",
    layerType: "layer_type",
    tooltipHtml: "tooltip",
  };
  if (kinds.has("scatter") || kinds.has("line") || kinds.has("arc")) {
    bindings.point1Latitude = "lat1";
    bindings.point1Longitude = "lon1";
  }
  if (kinds.has("line") || kinds.has("arc")) {
    bindings.point2Latitude = "lat2";
    bindings.point2Longitude = "lon2";
  }
  if (kinds.has("path") || kinds.has("polygon") || kinds.has("prism")) {
    bindings[geometryRole] = "geometry";
  }
  if (kinds.has("scatter")) {
    bindings.scatterRadius = "radius";
    bindings.scatterFillColor = "color";
  }
  if (kinds.has("line")) {
    bindings.lineLineWidth = "width";
    bindings.lineLineColor = "color";
  }
  if (kinds.has("arc")) {
    bindings.arcLineWidth = "width";
    bindings.arcSourceColor = "color";
    bindings.arcTargetColor = "color";
  }
  if (kinds.has("path")) {
    bindings.pathWidth = "width";
    bindings.pathColor = "color";
  }
  if (kinds.has("polygon") || kinds.has("prism")) {
    bindings.polygonFillColor = "color";
    bindings.polygonLineColor = "line_color";
    bindings.polygonExtrudeElevation = "elevation";
  }
  if (spec.timestamps) {
    bindings.timestamp = "timestamp";
  }

  // Power BI drops roles with no bound field, so unused columns stay unbound.
  return { table: { rowCount: rows, columns }, bindings };
};

export const syntheticScenarioId = (spec: SyntheticSpec): string =>
  [
    spec.kind,
    spec.geometry && ["path", "polygon", "prism", "mixed"].includes(spec.kind)
      ? spec.geometry
      : null,
    spec.color,
    spec.timestamps ? "timed" : null,
    spec.rows >= 1000 ? `${spec.rows / 1000}k` : String(spec.rows),
  ]
    .filter(Boolean)
    .join("-");

export const SYNTHETIC_SIZES = [10_000, 100_000, 500_000];

export const syntheticSpecs = (
  sizes: number[] = SYNTHETIC_SIZES,
  geometries: SyntheticGeometry[] = ["wkt", "wkp"],
): SyntheticSpec[] =>
  sizes.flatMap((rows) => [
    { kind: "scatter", rows, color: "numeric", timestamps: true },
    { kind: "line", rows, color: "hex" },
    { kind: "arc", rows, color: "numeric" },
    ...geometries.map(
      (geometry): SyntheticSpec => ({ kind: "path", rows, geometry, color: "categorical" }),
    ),
    ...geometries.map(
      (geometry): SyntheticSpec => ({ kind: "polygon", rows, geometry, color: "numeric" }),
    ),
    { kind: "prism", rows, geometry: "wkt", color: "hex" },
    { kind: "mixed", rows, geometry: "wkt", color: "numeric" },
  ]);

export const buildSyntheticScenario = (
  spec: SyntheticSpec,
  encodeWkp?: WkpEncoder,
  objects: ObjectValues = {},
): ScenarioDataView => {
  const { table, bindings } = generateSyntheticTable(spec, encodeWkp);
  return {
    id: syntheticScenarioId(spec),
    description: `Synthetic ${spec.kind}${spec.geometry ? ` (${spec.geometry})` : ""}, ${spec.color} colour, ${spec.rows.toLocaleString("en-NZ")} rows`,
    rowCount: spec.rows,
    options: buildUpdateOptions(table, bindings, baseObjects(objects)),
  };
};

// Repeats the Hamilton road network on a grid of offsets so the paths keep
// their real vertex counts and shapes at nationwide row counts.
export const tileHamiltonRoads = (
  roads: TableColumns,
  copies: number,
  decode: (encoded: string) => { type: string; coordinates: any },
  encode: WkpEncoder,
): TableColumns => {
  const tiles: TableColumns[] = [];
  const decoded = roads.columns.wkp.map((value) =>
    value === null ? null : decode(String(value)),
  );
  const shift = (coordinates: any, dx: number, dy: number): any =>
    typeof coordinates[0] === "number"
      ? [roundTo(coordinates[0] + dx, 6), roundTo(coordinates[1] + dy, 6), ...coordinates.slice(2)]
      : coordinates.map((child: any) => shift(child, dx, dy));

  for (let copy = 0; copy < copies; copy += 1) {
    const dx = (copy % 8) * 0.35 - 1.4;
    const dy = Math.floor(copy / 8) * 0.3 - 0.9;
    const columns: Record<string, CellValue[]> = {};
    for (const [name, values] of Object.entries(roads.columns)) {
      columns[name] =
        name === "geometry_id"
          ? values.map((value) => `${String(value)}-${copy}`)
          : name === "wkp"
            ? decoded.map((geometry) =>
                geometry
                  ? encode({ type: geometry.type, coordinates: shift(geometry.coordinates, dx, dy) }, 6)
                  : null,
              )
            : values;
    }
    tiles.push({ rowCount: roads.rowCount, columns });
  }
  return concatTables(tiles);
};
