import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { createWkp } from "@wkpjs/web";

type ColorMode = "default" | "hex" | "rgba" | "numeric" | "categorical";
type GeometryMode = "coordinates" | "wkt" | "wkp";
type LayerMode = "arc" | "path" | "mixed";
type BinningMethod =
  | "equal-interval"
  | "quantile"
  | "natural-breaks"
  | "defined-interval";

interface BenchmarkScenario {
  id: string;
  rowCount: number;
  layerMode: LayerMode;
  geometryMode: GeometryMode;
  colorMode: ColorMode;
  binningMethod: BinningMethod;
  selectedCount?: number;
  skipLegacyNaturalBreaks?: boolean;
}

interface BenchmarkMetric {
  elapsedMs: number | null;
  heapDeltaBytes: number | null;
  calls?: number;
  functionCalls?: number;
  constantCalls?: number;
  iterations?: number;
  warmupIterations?: number;
  medianMs?: number;
  nsPerFunctionCall?: number | null;
  samplesMs?: number[];
  skipped?: string;
}

interface BenchmarkScenarioResult {
  scenario: BenchmarkScenario;
  rowsParsed: number;
  layerRows: Record<string, number>;
  colorRoles?: Record<string, unknown>;
  metrics: Record<string, BenchmarkMetric>;
}

export interface BenchmarkRunResult {
  label: string;
  repoPath: string;
  commit: string;
  startedAt: string;
  nodeVersion: string;
  scenarios: BenchmarkScenarioResult[];
}

interface BenchmarkRunOptions {
  repoPath: string;
  label: string;
  outputDir?: string;
  writeOutput?: boolean;
}

interface ParsedDataset {
  dataPoints: any[];
  layers: {
    all: any[];
    scatter: any[];
    line: any[];
    arc: any[];
    path: any[];
    polygon: any[];
  };
  colorRoles?: any;
  version: string;
  isSnapshot: boolean;
}

interface ColorAccessorSweepStats {
  calls: number;
  functionCalls: number;
  constantCalls: number;
}

const scenarios: BenchmarkScenario[] = [
  {
    id: "arc-default-10k",
    rowCount: 10000,
    layerMode: "arc",
    geometryMode: "coordinates",
    colorMode: "default",
    binningMethod: "equal-interval",
  },
  {
    id: "arc-default-65k",
    rowCount: 65000,
    layerMode: "arc",
    geometryMode: "coordinates",
    colorMode: "default",
    binningMethod: "equal-interval",
  },
  {
    id: "arc-default-100k",
    rowCount: 100000,
    layerMode: "arc",
    geometryMode: "coordinates",
    colorMode: "default",
    binningMethod: "equal-interval",
  },
  {
    id: "arc-hex-65k",
    rowCount: 65000,
    layerMode: "arc",
    geometryMode: "coordinates",
    colorMode: "hex",
    binningMethod: "equal-interval",
  },
  {
    id: "arc-rgba-65k",
    rowCount: 65000,
    layerMode: "arc",
    geometryMode: "coordinates",
    colorMode: "rgba",
    binningMethod: "equal-interval",
  },
  {
    id: "arc-numeric-equal-65k",
    rowCount: 65000,
    layerMode: "arc",
    geometryMode: "coordinates",
    colorMode: "numeric",
    binningMethod: "equal-interval",
  },
  {
    id: "arc-numeric-quantile-65k",
    rowCount: 65000,
    layerMode: "arc",
    geometryMode: "coordinates",
    colorMode: "numeric",
    binningMethod: "quantile",
  },
  {
    id: "arc-natural-breaks-100k",
    rowCount: 100000,
    layerMode: "arc",
    geometryMode: "coordinates",
    colorMode: "numeric",
    binningMethod: "natural-breaks",
    skipLegacyNaturalBreaks: true,
  },
  {
    id: "arc-selection-fade-65k",
    rowCount: 65000,
    layerMode: "arc",
    geometryMode: "coordinates",
    colorMode: "hex",
    binningMethod: "equal-interval",
    selectedCount: 100,
  },
  {
    id: "path-wkt-numeric-10k",
    rowCount: 10000,
    layerMode: "path",
    geometryMode: "wkt",
    colorMode: "numeric",
    binningMethod: "equal-interval",
  },
  {
    id: "path-wkt-categorical-10k",
    rowCount: 10000,
    layerMode: "path",
    geometryMode: "wkt",
    colorMode: "categorical",
    binningMethod: "equal-interval",
  },
  {
    id: "path-wkp-numeric-10k",
    rowCount: 10000,
    layerMode: "path",
    geometryMode: "wkp",
    colorMode: "numeric",
    binningMethod: "equal-interval",
  },
  {
    id: "mixed-numeric-10k",
    rowCount: 10000,
    layerMode: "mixed",
    geometryMode: "coordinates",
    colorMode: "numeric",
    binningMethod: "equal-interval",
  },
  {
    id: "mixed-categorical-10k",
    rowCount: 10000,
    layerMode: "mixed",
    geometryMode: "coordinates",
    colorMode: "categorical",
    binningMethod: "equal-interval",
  },
];

const isLegacyRef = (label: string): boolean => label === "v1.5.3.0";

const importFromRepo = async <T>(
  repoPath: string,
  relativePath: string,
): Promise<T> => {
  const modulePath = pathToFileURL(path.join(repoPath, relativePath)).href;
  return import(modulePath) as Promise<T>;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const installPowerBiGlobal = () => {
  (globalThis as any).powerbi ??= {
    visuals: {
      ValidatorType: {
        Min: "Min",
        Max: "Max",
      },
    },
  };
};

const muteConsole = async <T>(task: () => Promise<T> | T): Promise<T> => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  try {
    console.log = () => undefined;
    console.warn = () => undefined;
    console.error = () => undefined;
    return await task();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
};

const getCommit = (repoPath: string): string => {
  try {
    const commit = execFileSync(
      "git",
      ["-C", repoPath, "rev-parse", "--short", "HEAD"],
      {
        encoding: "utf8",
      },
    ).trim();
    const dirty = execFileSync("git", ["-C", repoPath, "status", "--short"], {
      encoding: "utf8",
    }).trim();
    return dirty ? `${commit}+dirty` : commit;
  } catch {
    return "unknown";
  }
};

const forceGc = () => {
  if (typeof global.gc === "function") {
    global.gc();
  }
};

const measure = async <T>(
  task: () => Promise<T> | T,
): Promise<{ metric: BenchmarkMetric; result: T }> => {
  forceGc();
  const heapBefore =
    typeof process.memoryUsage === "function"
      ? process.memoryUsage().heapUsed
      : null;
  const start = performance.now();
  const result = await task();
  const elapsedMs = performance.now() - start;
  forceGc();
  const heapAfter =
    typeof process.memoryUsage === "function"
      ? process.memoryUsage().heapUsed
      : null;

  return {
    metric: {
      elapsedMs,
      heapDeltaBytes:
        heapBefore === null || heapAfter === null ? null : heapAfter - heapBefore,
    },
    result,
  };
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[midpoint];
  }
  return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
};

const assertBenchmark = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(`Benchmark validation failed: ${message}`);
  }
};

const colorsEqual = (actual: unknown, expected: number[]): boolean =>
  Array.isArray(actual) &&
  actual.length === expected.length &&
  actual.every((value, index) => value === expected[index]);

const makeColumn = (
  roleName: string,
  values: unknown[],
  displayName = roleName,
) => ({
  source: {
    roles: { [roleName]: true },
    displayName,
    queryName: `bench.${roleName}`,
  },
  values,
});

const makeCategory = (values: string[]) => ({
  source: {
    roles: { geometryId: true },
    displayName: "Geometry ID",
    queryName: "bench.geometryId",
  },
  values,
});

const makeRoleCategory = (
  roleName: string,
  values: unknown[],
  displayName = roleName,
) => ({
  source: {
    roles: { [roleName]: true },
    displayName,
    queryName: `bench.${roleName}`,
  },
  values,
});

const coordinateForIndex = (index: number) => {
  const band = index % 400;
  const group = Math.floor(index / 400) % 250;
  const lon = 172.5 + band * 0.001 + group * 0.0001;
  const lat = -43.8 + (index % 300) * 0.001;
  return { lon, lat };
};

const colorValueForIndex = (
  index: number,
  mode: ColorMode,
): string | number | null => {
  if (mode === "default") {
    return null;
  }
  if (mode === "hex") {
    return index % 2 === 0 ? "#005BBBF2" : "#66A3E0CC";
  }
  if (mode === "rgba") {
    const alpha = 0.35 + (index % 50) / 100;
    return `rgba(${index % 255}, ${120 + (index % 90)}, 210, ${alpha})`;
  }
  if (mode === "categorical") {
    return ["sealed", "metalled", "unmetalled", "chip seal", "concrete"][
      index % 5
    ];
  }
  return Math.log1p((index * 37) % 100000);
};

const makeWktLine = (index: number): string => {
  const point1 = coordinateForIndex(index);
  const point2 = coordinateForIndex(index + 17);
  return `LINESTRING (${point1.lon} ${point1.lat}, ${point2.lon} ${point2.lat})`;
};

const createWkpEncoder = async () => {
  const wasmPath = path.join(
    process.cwd(),
    "node_modules",
    "@wkpjs",
    "web",
    "dist",
    "wkp_core.wasm",
  );
  const wasmBinary = await readFile(wasmPath);
  const wkp = await createWkp({ wasmBinary });
  const ctx = new wkp.Context();

  return (index: number): string => {
    const point1 = coordinateForIndex(index);
    const point2 = coordinateForIndex(index + 17);
    return wkp.encode(
      ctx,
      {
        type: "LineString",
        coordinates: [
          [point1.lon, point1.lat],
          [point2.lon, point2.lat],
        ],
      },
      6,
    );
  };
};

const layerTypeForRow = (scenario: BenchmarkScenario, index: number): string => {
  if (scenario.layerMode === "path") {
    return "path";
  }
  if (scenario.layerMode === "mixed") {
    return ["scatter", "line", "arc"][index % 3];
  }
  return "arc";
};

const buildSyntheticOptions = async (scenario: BenchmarkScenario) => {
  const geometryIds: string[] = [];
  const layerTypes: string[] = [];
  const point1Lat: number[] = [];
  const point1Lon: number[] = [];
  const point2Lat: number[] = [];
  const point2Lon: number[] = [];
  const arcWidth: number[] = [];
  const arcSourceColor: Array<string | number | null> = [];
  const arcTargetColor: Array<string | number | null> = [];
  const scatterRadius: number[] = [];
  const scatterLineWidth: number[] = [];
  const scatterFillColor: Array<string | number | null> = [];
  const scatterLineColor: Array<string | number | null> = [];
  const lineWidth: number[] = [];
  const lineColor: Array<string | number | null> = [];
  const pathWidth: number[] = [];
  const pathColor: Array<string | number | null> = [];
  const wkt: Array<string | null> = [];
  const wkp: Array<string | null> = [];
  const tooltip: string[] = [];
  const encodeWkp =
    scenario.geometryMode === "wkp" ? await createWkpEncoder() : null;

  for (let index = 0; index < scenario.rowCount; index += 1) {
    const layerType = layerTypeForRow(scenario, index);
    const point1 = coordinateForIndex(index);
    const point2 = coordinateForIndex(index + 17);
    const color = colorValueForIndex(index, scenario.colorMode);

    geometryIds.push(`${scenario.id}-${index}`);
    layerTypes.push(layerType);
    point1Lat.push(point1.lat);
    point1Lon.push(point1.lon);
    point2Lat.push(point2.lat);
    point2Lon.push(point2.lon);
    arcWidth.push(1 + (index % 8));
    arcSourceColor.push(layerType === "arc" ? color : null);
    arcTargetColor.push(layerType === "arc" ? color : null);
    scatterRadius.push(40 + (index % 25));
    scatterLineWidth.push(1 + (index % 4));
    scatterFillColor.push(layerType === "scatter" ? color : null);
    scatterLineColor.push(layerType === "scatter" ? color : null);
    lineWidth.push(1 + (index % 6));
    lineColor.push(layerType === "line" ? color : null);
    pathWidth.push(1 + (index % 5));
    pathColor.push(layerType === "path" ? color : null);
    wkt.push(
      layerType === "path" && scenario.geometryMode === "wkt"
        ? makeWktLine(index)
        : null,
    );
    wkp.push(
      layerType === "path" && scenario.geometryMode === "wkp" && encodeWkp
        ? encodeWkp(index)
        : null,
    );
    tooltip.push(`row ${index}<br>scenario ${scenario.id}`);
  }

  const columns = [
    makeColumn("layerType", layerTypes),
    makeColumn("point1Latitude", point1Lat),
    makeColumn("point1Longitude", point1Lon),
    makeColumn("point2Latitude", point2Lat),
    makeColumn("point2Longitude", point2Lon),
    makeColumn("arcLineWidth", arcWidth),
    makeColumn("scatterRadius", scatterRadius),
    makeColumn("scatterLineWidth", scatterLineWidth),
    makeColumn("lineLineWidth", lineWidth),
    makeColumn("pathWidth", pathWidth),
    makeColumn("tooltipHtml", tooltip),
  ];

  if (scenario.colorMode !== "default") {
    columns.push(
      makeColumn("arcSourceColor", arcSourceColor),
      makeColumn("arcTargetColor", arcTargetColor),
      makeColumn("scatterFillColor", scatterFillColor),
      makeColumn("scatterLineColor", scatterLineColor),
      makeColumn("lineLineColor", lineColor),
      makeColumn("pathColor", pathColor),
    );
  }
  if (scenario.geometryMode === "wkt") {
    columns.push(makeColumn("wkt", wkt));
  }
  if (scenario.geometryMode === "wkp") {
    columns.push(makeColumn("wkp", wkp));
  }

  return {
    dataViews: [
      {
        categorical: {
          categories: [makeCategory(geometryIds)],
          values: columns,
        },
        metadata: {},
      },
    ],
  };
};

const createMockHost = () => ({
  displayWarningIcon: () => undefined,
  fetchMoreData: () => false,
  createSelectionIdBuilder: () => {
    let rowIndex = 0;
    return {
      withCategory: (_category: unknown, index: number) => {
        rowIndex = index;
        return {
          createSelectionId: () => ({
            key: `selection-${rowIndex}`,
            getKey: () => `selection-${rowIndex}`,
          }),
        };
      },
    };
  },
});

const configureSettings = (
  settings: any,
  scenario: BenchmarkScenario,
) => {
  settings.validation.validateGeometries.value = true;
  settings.highlighting.highlightOnClick.value = (scenario.selectedCount ?? 0) > 0;

  for (const gradient of [
    settings.scatter.fillGradient,
    settings.scatter.lineGradient,
    settings.line.gradient,
    settings.path.gradient,
    settings.polygon.fillGradient,
    settings.polygon.lineGradient,
    settings.arc.sourceGradient,
    settings.arc.targetGradient,
  ]) {
    gradient.binningMethod.value.value = scenario.binningMethod;
  }
};

const splitLayerData = (dataPoints: any[]) => {
  const layers = {
    all: dataPoints,
    scatter: [] as any[],
    line: [] as any[],
    arc: [] as any[],
    path: [] as any[],
    polygon: [] as any[],
  };

  for (const dataPoint of dataPoints) {
    if (dataPoint.type === "scatter") {
      layers.scatter.push(dataPoint);
    } else if (dataPoint.type === "line") {
      layers.line.push(dataPoint);
    } else if (dataPoint.type === "arc") {
      layers.arc.push(dataPoint);
    } else if (dataPoint.type === "path") {
      layers.path.push(dataPoint);
    } else if (dataPoint.type === "polygon") {
      layers.polygon.push(dataPoint);
    }
  }

  return layers;
};

const parseDataset = (
  mapperModule: any,
  options: any,
  settings: any,
  host: any,
  geometryCache: Map<string, unknown>,
): ParsedDataset => {
  if (typeof mapperModule.createDatasetSnapshot === "function") {
    const snapshot = mapperModule.createDatasetSnapshot(
      options,
      settings,
      host,
      geometryCache,
      "bench",
    );
    return {
      dataPoints: snapshot.layers.all,
      layers: snapshot.layers,
      colorRoles: snapshot.colorRoles,
      version: snapshot.version ?? "bench",
      isSnapshot: true,
    };
  }

  const dataPoints = mapperModule.createSelectorDataPoints(
    options,
    settings,
    host,
    geometryCache,
  );
  return {
    dataPoints,
    layers: splitLayerData(dataPoints),
    version: "legacy",
    isSnapshot: false,
  };
};

const validateColorParsing = (powerbiUtilsModule: any): boolean => {
  const parseColorInput = powerbiUtilsModule.parseColorInput;
  if (typeof parseColorInput !== "function") {
    return false;
  }

  const categorical = parseColorInput("sealed");
  if (!("categoricalValue" in categorical)) {
    return false;
  }

  assertBenchmark(
    colorsEqual(parseColorInput("#abc").rgbaColor, [170, 187, 204, 255]),
    "#RGB should still parse as a direct color",
  );
  assertBenchmark(
    colorsEqual(parseColorInput("#AABBCCDD").rgbaColor, [170, 187, 204, 221]),
    "#RRGGBBAA should still parse as a direct color",
  );
  assertBenchmark(
    colorsEqual(parseColorInput("rgba(1, 2, 3, 0.5)").rgbaColor, [
      1,
      2,
      3,
      128,
    ]),
    "rgba(...) should still parse as a direct color",
  );
  assertBenchmark(
    parseColorInput(" 1e3 ").numericValue === 1000,
    "strict numeric strings should parse as numeric values",
  );
  assertBenchmark(
    parseColorInput(42).numericValue === 42,
    "finite numeric primitives should parse as numeric values",
  );
  assertBenchmark(
    parseColorInput("123abc").categoricalValue === "123abc",
    "numeric-looking non-numbers should parse as categories",
  );
  assertBenchmark(
    parseColorInput(" #zzzzzz ").categoricalValue === "#zzzzzz",
    "invalid color-looking text should parse as a category",
  );
  assertBenchmark(
    parseColorInput(" 'metalled' ").categoricalValue === "metalled",
    "quoted category labels should be trimmed",
  );
  assertBenchmark(
    parseColorInput("   ").categoricalValue === null,
    "whitespace-only strings should use the default color path",
  );
  assertBenchmark(
    parseColorInput(true).categoricalValue === null,
    "boolean primitives should use the default color path",
  );
  assertBenchmark(
    parseColorInput(new Date("2026-05-13T00:00:00Z")).categoricalValue === null,
    "date primitives should use the default color path",
  );

  return true;
};

const copyValueRoleToCategoryAndBlankValue = (
  options: any,
  roleName: string,
  categoryDisplayName?: string,
) => {
  const categorical = options.dataViews?.[0]?.categorical;
  const values = categorical?.values ?? [];
  const roleIndex = values.findIndex(
    (column: any) => column.source?.roles?.[roleName],
  );

  assertBenchmark(roleIndex >= 0, `${roleName} value column should exist`);
  const column = values[roleIndex];
  const categoryValues = [...(column.values ?? [])];
  column.values = categoryValues.map(() => null);
  categorical.categories.push(
    makeRoleCategory(
      roleName,
      categoryValues,
      categoryDisplayName ?? column.source?.displayName ?? roleName,
    ),
  );
};

const copyValueRoleToGroupedSeries = (
  options: any,
  roleName: string,
  seriesDisplayName?: string,
) => {
  const categorical = options.dataViews?.[0]?.categorical;
  const values = categorical?.values ?? [];
  const roleColumn = values.find((column: any) => column.source?.roles?.[roleName]);

  assertBenchmark(!!roleColumn, `${roleName} value column should exist`);
  const roleValues = [...(roleColumn.values ?? [])];
  const seriesValues = Array.from(
    new Set(
      roleValues
        .filter((value) => value !== null && value !== undefined)
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0),
    ),
  );
  const groupedValueColumns = values.filter(
    (column: any) => !column.source?.roles?.[roleName],
  );

  const groups = seriesValues.map((seriesValue) => ({
    name: seriesValue,
    values: groupedValueColumns.map((column: any) => ({
      source: column.source,
      values: (column.values ?? []).map((value: unknown, index: number) =>
        String(roleValues[index]).trim() === seriesValue ? value : null,
      ),
    })),
  }));
  const flattenedValues = groups.flatMap((group) => group.values) as any[];
  flattenedValues.push(
    makeColumn(
      roleName,
      roleValues.map(() => null),
      `First ${seriesDisplayName ?? roleColumn.source?.displayName ?? roleName}`,
    ),
  );
  (flattenedValues as any).source = {
    roles: { [roleName]: true },
    displayName: seriesDisplayName ?? roleColumn.source?.displayName ?? roleName,
    queryName: `bench.${roleName}.series`,
  };
  (flattenedValues as any).grouped = () => groups;
  categorical.values = flattenedValues;
};

const assertPathCategoricalRendering = async (
  repoPath: string,
  parsed: ParsedDataset,
  legendModule: any,
  settings: any,
  options: any,
  context: string,
) => {
  const stats = parsed.colorRoles?.pathColor;

  assertBenchmark(parsed.dataPoints.length > 0, `${context} rows should parse`);
  assertBenchmark(
    stats?.hasCategoricalColor === true,
    `${context} should populate categorical path color stats`,
  );
  assertBenchmark(
    stats?.hasNumericColor === false,
    `${context} should not promote path categories to numeric mode`,
  );

  const pathCategories = parsed.layers.path.map(
    (feature: any) => feature.properties?.lineColorCategory,
  );
  for (const expectedLabel of ["sealed", "metalled", "unmetalled"]) {
    assertBenchmark(
      pathCategories.includes(expectedLabel),
      `${context} should populate ${expectedLabel} path row categories`,
    );
  }

  const legendSpecs = buildLegendSpecs(
    legendModule,
    parsed,
    settings,
    options,
    new Map<string, unknown>(),
  );
  const categoricalLegend = legendSpecs.find(
    (spec: any) => spec.type === "categorical" && spec.key === "path",
  );
  assertBenchmark(
    categoricalLegend?.title === "road_surface",
    `${context} should preserve the field display name in the legend`,
  );
  const legendLabels = new Set(
    (categoricalLegend?.classes ?? []).map((entry: any) => entry.label),
  );
  for (const expectedLabel of ["sealed", "metalled", "unmetalled"]) {
    assertBenchmark(
      legendLabels.has(expectedLabel),
      `${context} legend should include ${expectedLabel}`,
    );
  }

  const [pathLayerModule, paletteModule] = await Promise.all([
    importFromRepo<any>(repoPath, "src/layers/path.ts"),
    importFromRepo<any>(repoPath, "src/categoricalPalettes.ts"),
  ]);
  const getPathLayer = pathLayerModule.default;
  const getCategoricalPaletteColor = paletteModule.getCategoricalPaletteColor;
  const pathLayer = getPathLayer(
    parsed.layers.path,
    settings.path,
    settings.highlighting,
    new Set<string>(),
    "",
    parsed.colorRoles,
    new Map<string, unknown>(),
    parsed.version,
    () => undefined,
  );
  assertBenchmark(
    typeof pathLayer.props.getLineColor === "function",
    `${context} should create a path color accessor`,
  );

  const expectedColors = new Map(
    ["sealed", "metalled", "unmetalled"].map((category) => [
      category,
      getCategoricalPaletteColor(
        category,
        settings.path.categoricalPalette.palette.value.value,
        settings.path.line.color.defaultLineOpacity.value,
      ),
    ]),
  );
  const observedColors = new Map<string, number[]>();
  for (const feature of parsed.layers.path) {
    const category = feature.properties?.lineColorCategory;
    if (category && !observedColors.has(category)) {
      observedColors.set(category, pathLayer.props.getLineColor(feature));
    }
  }
  for (const [category, expectedColor] of expectedColors) {
    assertBenchmark(
      colorsEqual(observedColors.get(category), expectedColor),
      `${context} should color ${category} path rows with the categorical palette`,
    );
  }
  assertBenchmark(
    new Set(Array.from(observedColors.values()).map((color) => color.join(",")))
      .size >= 3,
    `${context} should produce visibly distinct path colors`,
  );
};

const validateRoleCategoryColumn = async (
  repoPath: string,
  mapperModule: any,
  legendModule: any,
  settings: any,
  host: any,
) => {
  const options = await buildSyntheticOptions({
    id: "path-wkt-categorical-category-role-check",
    rowCount: 30,
    layerMode: "path",
    geometryMode: "wkt",
    colorMode: "categorical",
    binningMethod: "equal-interval",
  });
  const pathColorColumn = options.dataViews?.[0]?.categorical?.values?.find(
    (column: any) => column.source?.roles?.pathColor,
  );
  if (pathColorColumn?.source) {
    pathColorColumn.source.displayName = "First road_surface";
  }
  copyValueRoleToCategoryAndBlankValue(options, "pathColor", "road_surface");

  const parsed = parseDataset(
    mapperModule,
    options,
    settings,
    host,
    new Map<string, unknown>(),
  );
  await assertPathCategoricalRendering(
    repoPath,
    parsed,
    legendModule,
    settings,
    options,
    "role category column",
  );
};

const validateDesktopGroupedPathColor = async (
  repoPath: string,
  mapperModule: any,
  legendModule: any,
  settings: any,
  host: any,
) => {
  const options = await buildSyntheticOptions({
    id: "path-wkt-categorical-grouped-role-check",
    rowCount: 30,
    layerMode: "path",
    geometryMode: "wkt",
    colorMode: "categorical",
    binningMethod: "equal-interval",
  });
  const pathColorColumn = options.dataViews?.[0]?.categorical?.values?.find(
    (column: any) => column.source?.roles?.pathColor,
  );
  if (pathColorColumn?.source) {
    pathColorColumn.source.displayName = "First road_surface";
  }
  copyValueRoleToGroupedSeries(options, "pathColor", "road_surface");

  const parsed = parseDataset(
    mapperModule,
    options,
    settings,
    host,
    new Map<string, unknown>(),
  );
  await assertPathCategoricalRendering(
    repoPath,
    parsed,
    legendModule,
    settings,
    options,
    "Desktop grouped pathColor",
  );
  assertBenchmark(
    parsed.layers.path.length === 30,
    "Desktop grouped pathColor should keep rows from every category group",
  );
  for (const feature of parsed.layers.path) {
    assertBenchmark(
      !!feature.properties?.lineColorCategory,
      "Desktop grouped pathColor should assign every path row a category",
    );
  }
};

const validateMixedPathCategoricalData = (
  mapperModule: any,
  legendModule: any,
  settings: any,
  host: any,
) => {
  const ids = ["path-1", "polygon-1", "scatter-1", "path-2", "polygon-2", "path-3"];
  const layerTypes = ["path", "polygon", "scatter", "path", "polygon", "path"];
  const pathCategories = ["sealed", null, null, "metalled", null, "unmetalled"];
  const wkt = [
    "LINESTRING (175 -37.8, 175.001 -37.799)",
    "POLYGON ((175 -37.8, 175.001 -37.8, 175.001 -37.799, 175 -37.799, 175 -37.8))",
    null,
    "LINESTRING (175.002 -37.8, 175.003 -37.799)",
    "POLYGON ((175.002 -37.8, 175.003 -37.8, 175.003 -37.799, 175.002 -37.799, 175.002 -37.8))",
    "LINESTRING (175.004 -37.8, 175.005 -37.799)",
  ];
  const options = {
    dataViews: [
      {
        categorical: {
          categories: [
            makeRoleCategory("geometryId", ids, "geometry_id"),
            makeRoleCategory("pathColor", pathCategories, "road_surface"),
          ],
          values: [
            makeColumn("layerType", layerTypes),
            makeColumn("wkt", wkt),
            makeColumn("point1Latitude", [null, null, -37.8, null, null, null]),
            makeColumn("point1Longitude", [null, null, 175, null, null, null]),
            makeColumn("scatterRadius", [null, null, 50, null, null, null]),
            makeColumn("pathWidth", [3, null, null, 3, null, 3]),
            makeColumn("pathColor", pathCategories.map(() => null)),
          ],
        },
        metadata: {},
      },
    ],
  };

  const parsed = parseDataset(
    mapperModule,
    options,
    settings,
    host,
    new Map<string, unknown>(),
  );
  const stats = parsed.colorRoles?.pathColor;
  assertBenchmark(parsed.layers.path.length === 3, "mixed data should parse path rows");
  assertBenchmark(
    parsed.layers.polygon.length === 2,
    "mixed data should parse polygon rows",
  );
  assertBenchmark(
    parsed.layers.scatter.length === 1,
    "mixed data should parse scatter rows",
  );
  assertBenchmark(
    stats?.hasCategoricalColor === true && stats?.hasNumericColor === false,
    "mixed data should keep path color in categorical mode",
  );

  const legendSpecs = buildLegendSpecs(
    legendModule,
    parsed,
    settings,
    options,
    new Map<string, unknown>(),
  );
  const labels = new Set(
    (
      legendSpecs.find((spec: any) => spec.type === "categorical" && spec.key === "path")
        ?.classes ?? []
    ).map((entry: any) => entry.label),
  );
  for (const expectedLabel of ["sealed", "metalled", "unmetalled"]) {
    assertBenchmark(
      labels.has(expectedLabel),
      `mixed data path legend should include ${expectedLabel}`,
    );
  }
};

const selectedIdsForScenario = (
  parsed: ParsedDataset,
  scenario: BenchmarkScenario,
): Set<string> =>
  new Set(
    parsed.dataPoints
      .slice(0, scenario.selectedCount ?? 0)
      .map((dataPoint) => String(dataPoint.id)),
  );

const callLayerFactory = (
  factory: any,
  currentData: any[],
  legacyData: any[],
  settings: any,
  highlighting: any,
  selectedIds: Set<string>,
  selectedSignature: string,
  colorRoles: any,
  classificationCache: Map<string, unknown>,
  dataVersion: string,
) => {
  if (factory.length >= 9) {
    return factory(
      currentData,
      settings,
      highlighting,
      selectedIds,
      selectedSignature,
      colorRoles,
      classificationCache,
      dataVersion,
      () => undefined,
    );
  }
  if (factory.length >= 8) {
    return factory(
      currentData,
      settings,
      highlighting,
      selectedIds,
      selectedSignature,
      classificationCache,
      dataVersion,
      () => undefined,
    );
  }
  return factory(legacyData, settings, highlighting, selectedIds, () => undefined);
};

const buildLayers = async (
  repoPath: string,
  parsed: ParsedDataset,
  settings: any,
  selectedIds: Set<string>,
  selectedSignature: string,
  classificationCache: Map<string, unknown>,
) => {
  const [
    scatterModule,
    lineModule,
    arcModule,
    pathModule,
    polygonModule,
  ] = await Promise.all([
    importFromRepo<any>(repoPath, "src/layers/scatter.ts"),
    importFromRepo<any>(repoPath, "src/layers/line.ts"),
    importFromRepo<any>(repoPath, "src/layers/arc.ts"),
    importFromRepo<any>(repoPath, "src/layers/path.ts"),
    importFromRepo<any>(repoPath, "src/layers/polygon.ts"),
  ]);

  const colorRoles = parsed.colorRoles ?? {};
  return [
    callLayerFactory(
      scatterModule.default,
      parsed.layers.scatter,
      parsed.dataPoints,
      settings.scatter,
      settings.highlighting,
      selectedIds,
      selectedSignature,
      colorRoles,
      classificationCache,
      parsed.version,
    ),
    callLayerFactory(
      lineModule.default,
      parsed.layers.line,
      parsed.dataPoints,
      settings.line,
      settings.highlighting,
      selectedIds,
      selectedSignature,
      colorRoles,
      classificationCache,
      parsed.version,
    ),
    callLayerFactory(
      arcModule.default,
      parsed.layers.arc,
      parsed.dataPoints,
      settings.arc,
      settings.highlighting,
      selectedIds,
      selectedSignature,
      colorRoles,
      classificationCache,
      parsed.version,
    ),
    callLayerFactory(
      pathModule.default,
      parsed.layers.path,
      parsed.dataPoints,
      settings.path,
      settings.highlighting,
      selectedIds,
      selectedSignature,
      colorRoles,
      classificationCache,
      parsed.version,
    ),
    callLayerFactory(
      polygonModule.default,
      parsed.layers.polygon,
      parsed.dataPoints,
      settings.polygon,
      settings.highlighting,
      selectedIds,
      selectedSignature,
      colorRoles,
      classificationCache,
      parsed.version,
    ),
  ];
};

const sweepColorAccessors = (layers: any[]): ColorAccessorSweepStats => {
  const accessorNames = [
    "getColor",
    "getFillColor",
    "getLineColor",
    "getSourceColor",
    "getTargetColor",
  ];
  let calls = 0;
  let functionCalls = 0;
  let constantCalls = 0;

  for (const layer of layers) {
    const data = layer?.props?.data ?? [];
    for (const accessorName of accessorNames) {
      const accessor = layer?.props?.[accessorName];
      if (!accessor) {
        continue;
      }
      if (typeof accessor !== "function") {
        calls += data.length;
        constantCalls += data.length;
        continue;
      }
      for (const item of data) {
        accessor(item);
        calls += 1;
        functionCalls += 1;
      }
    }
  }

  return { calls, functionCalls, constantCalls };
};

const measureColorAccessorSweep = (layers: any[]): BenchmarkMetric => {
  const warmupIterations = 3;
  const iterations = 9;
  let stats: ColorAccessorSweepStats = {
    calls: 0,
    functionCalls: 0,
    constantCalls: 0,
  };

  for (let index = 0; index < warmupIterations; index += 1) {
    stats = sweepColorAccessors(layers);
  }

  forceGc();
  const heapBefore =
    typeof process.memoryUsage === "function"
      ? process.memoryUsage().heapUsed
      : null;
  const samplesMs: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    stats = sweepColorAccessors(layers);
    samplesMs.push(performance.now() - start);
  }
  forceGc();
  const heapAfter =
    typeof process.memoryUsage === "function"
      ? process.memoryUsage().heapUsed
      : null;
  const medianMs = median(samplesMs);

  return {
    elapsedMs: medianMs,
    heapDeltaBytes:
      heapBefore === null || heapAfter === null ? null : heapAfter - heapBefore,
    calls: stats.calls,
    functionCalls: stats.functionCalls,
    constantCalls: stats.constantCalls,
    iterations,
    warmupIterations,
    medianMs,
    nsPerFunctionCall:
      stats.functionCalls > 0 ? (medianMs * 1_000_000) / stats.functionCalls : null,
    samplesMs,
  };
};

const classifyNumericColors = (
  gradientModule: any,
  parsed: ParsedDataset,
  scenario: BenchmarkScenario,
) => {
  if (scenario.colorMode !== "numeric") {
    return 0;
  }

  const accessor = (dataPoint: any) =>
    dataPoint.arcProperties?.sourceColorValue ??
    dataPoint.lineProperties?.lineColorValue ??
    dataPoint.scatterProperties?.fillColorValue ??
    dataPoint.pathProperties?.lineColorValue ??
    dataPoint.properties?.lineColorValue ??
    null;

  gradientModule.getNumericColorBins(parsed.dataPoints, accessor, {
    method: scenario.binningMethod,
    classCount: 5,
    definedInterval: 10,
  });
  return parsed.dataPoints.length;
};

const buildLegendSpecs = (
  legendModule: any,
  parsed: ParsedDataset,
  settings: any,
  options: any,
  classificationCache: Map<string, unknown>,
) => {
  if (parsed.isSnapshot) {
    return legendModule.getGradientLegendSpecs(
      parsed.layers,
      settings,
      options.dataViews[0],
      classificationCache,
      parsed.version,
      parsed.colorRoles,
    );
  }

  return legendModule.getGradientLegendSpecs(
    parsed.dataPoints,
    settings,
    options.dataViews[0],
  );
};

const validateCategoricalScenario = (
  scenario: BenchmarkScenario,
  parsed: ParsedDataset,
  legendSpecs: unknown,
) => {
  if (scenario.colorMode !== "categorical") {
    return;
  }

  const roleStats = Object.values(parsed.colorRoles ?? {});
  const supportsCategoricalStats = roleStats.some(
    (stats: any) => "hasCategoricalColor" in stats,
  );
  if (!supportsCategoricalStats) {
    return;
  }

  const categoricalRoles = roleStats.filter(
    (stats: any) => stats.hasCategoricalColor,
  );
  assertBenchmark(
    categoricalRoles.length > 0,
    `${scenario.id} should produce categorical color stats`,
  );
  assertBenchmark(
    categoricalRoles.every((stats: any) => !stats.hasNumericColor),
    `${scenario.id} should not promote categorical colors to numeric mode`,
  );

  const specs = Array.isArray(legendSpecs) ? legendSpecs : [];
  const categoricalSpec = specs.find((spec: any) => spec.type === "categorical");
  assertBenchmark(
    !!categoricalSpec,
    `${scenario.id} should produce a categorical legend spec`,
  );

  const labels = new Set(
    ((categoricalSpec as any)?.classes ?? []).map((entry: any) => entry.label),
  );
  for (const expectedLabel of ["sealed", "metalled", "unmetalled"]) {
    assertBenchmark(
      labels.has(expectedLabel),
      `${scenario.id} legend should include ${expectedLabel}`,
    );
  }
};

const layerRows = (parsed: ParsedDataset): Record<string, number> => ({
  all: parsed.dataPoints.length,
  scatter: parsed.layers.scatter.length,
  line: parsed.layers.line.length,
  arc: parsed.layers.arc.length,
  path: parsed.layers.path.length,
  polygon: parsed.layers.polygon.length,
});

const runScenario = async (
  repoPath: string,
  label: string,
  scenario: BenchmarkScenario,
): Promise<BenchmarkScenarioResult> => {
  const metrics: Record<string, BenchmarkMetric> = {};
  installPowerBiGlobal();
  if (
    scenario.skipLegacyNaturalBreaks &&
    isLegacyRef(label) &&
    scenario.rowCount > 5000
  ) {
    return {
      scenario,
      rowsParsed: 0,
      layerRows: {},
      metrics: {
        skipped: {
          elapsedMs: null,
          heapDeltaBytes: null,
          skipped:
            "Skipped legacy natural-breaks > 5k rows to avoid known O(n^2) freeze.",
        },
      },
    };
  }
  if (scenario.geometryMode === "wkp") {
    return {
      scenario,
      rowsParsed: 0,
      layerRows: {},
      metrics: {
        skipped: {
          elapsedMs: null,
          heapDeltaBytes: null,
          skipped:
            "Skipped in Node: the WKP WASM core is patched for the Power BI browser bundle. Profile WKP inside Power BI Desktop.",
        },
      },
    };
  }

  const [
    mapperModule,
    settingsModule,
    gradientModule,
    legendModule,
    powerbiUtilsModule,
  ] = await muteConsole(() =>
    Promise.all([
      importFromRepo<any>(repoPath, "src/mapper.ts"),
      importFromRepo<any>(repoPath, "src/settings.ts"),
      importFromRepo<any>(repoPath, "src/gradientClassification.ts"),
      importFromRepo<any>(repoPath, "src/gradientLegend.ts"),
      importFromRepo<any>(repoPath, "src/powerbiUtils.ts"),
    ]),
  );
  if (scenario.geometryMode === "wkp") {
    await sleep(750);
  }

  const options = await buildSyntheticOptions(scenario);
  const settings = new settingsModule.VisualFormattingSettingsModel();
  configureSettings(settings, scenario);
  const host = createMockHost();
  const supportsCategoricalParsing = validateColorParsing(powerbiUtilsModule);
  if (supportsCategoricalParsing && scenario.id === "path-wkt-categorical-10k") {
    await validateRoleCategoryColumn(
      repoPath,
      mapperModule,
      legendModule,
      settings,
      host,
    );
    await validateDesktopGroupedPathColor(
      repoPath,
      mapperModule,
      legendModule,
      settings,
      host,
    );
    validateMixedPathCategoricalData(mapperModule, legendModule, settings, host);
  }
  const coldGeometryCache = new Map<string, unknown>();
  const warmGeometryCache = new Map<string, unknown>();

  const parseCold = await measure(() =>
    muteConsole(() =>
      parseDataset(mapperModule, options, settings, host, coldGeometryCache),
    ),
  );
  metrics.parseCold = parseCold.metric;

  await muteConsole(() =>
    parseDataset(mapperModule, options, settings, host, warmGeometryCache),
  );
  const parseWarm = await measure(() =>
    muteConsole(() =>
      parseDataset(mapperModule, options, settings, host, warmGeometryCache),
    ),
  );
  metrics.parseWarm = parseWarm.metric;
  const parsed = parseCold.result;
  const selectedIds = selectedIdsForScenario(parsed, scenario);
  const selectedSignature = Array.from(selectedIds).sort().join("|");

  if (scenario.colorMode === "numeric") {
    const classification = await measure(() =>
      classifyNumericColors(gradientModule, parsed, scenario),
    );
    metrics.classification = classification.metric;
  } else {
    metrics.classification = {
      elapsedMs: null,
      heapDeltaBytes: null,
      skipped: "Scenario has no numeric colour values.",
    };
  }

  const legendCache = new Map<string, unknown>();
  const legend = await measure(() =>
    buildLegendSpecs(legendModule, parsed, settings, options, legendCache),
  );
  metrics.legendSpecs = legend.metric;
  validateCategoricalScenario(scenario, parsed, legend.result);

  const layerCache = new Map<string, unknown>();
  const layersBuilt = await measure(() =>
    buildLayers(
      repoPath,
      parsed,
      settings,
      selectedIds,
      selectedSignature,
      layerCache,
    ),
  );
  metrics.layerConstruction = layersBuilt.metric;

  metrics.colorAccessorSweep = measureColorAccessorSweep(layersBuilt.result);

  return {
    scenario,
    rowsParsed: parsed.dataPoints.length,
    layerRows: layerRows(parsed),
    colorRoles: parsed.colorRoles,
    metrics,
  };
};

const outputFileName = (label: string): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeLabel = label.replace(/[^a-zA-Z0-9_.-]/g, "-");
  return `${safeLabel}-${timestamp}.json`;
};

export const runBenchmarkSuite = async ({
  repoPath,
  label,
  outputDir = path.join(process.cwd(), ".tmp", "benchmarks", "results"),
  writeOutput = true,
}: BenchmarkRunOptions): Promise<BenchmarkRunResult> => {
  const result: BenchmarkRunResult = {
    label,
    repoPath,
    commit: getCommit(repoPath),
    startedAt: new Date().toISOString(),
    nodeVersion: process.version,
    scenarios: [],
  };

  for (const scenario of scenarios) {
    console.log(`[bench] ${label} ${scenario.id}`);
    result.scenarios.push(await runScenario(repoPath, label, scenario));
  }

  if (writeOutput) {
    mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, outputFileName(label));
    writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`[bench] wrote ${outputPath}`);
  }

  return result;
};

const getArgValue = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};

const main = async () => {
  const repoPath = path.resolve(getArgValue("--repo", process.cwd()));
  const packageJsonPath = path.join(repoPath, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const label = getArgValue("--label", packageJson.version ?? "working-tree");
  await runBenchmarkSuite({ repoPath, label });
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
