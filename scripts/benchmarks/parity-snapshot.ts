// Writes a digest of everything the data pipeline produces for each scenario:
// parsed rows, colour stats, bounds, time domain, every colour accessor's
// output, legend specs and H3 cells. Run it on two checkouts and compare the
// files to prove a change leaves output identical.
//
//   npm run bench:parity -- --label after
//   npm run bench:parity -- --compare baseline,after

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

(globalThis as any).powerbi ??= {
  visuals: { ValidatorType: { Min: "Min", Max: "Max" } },
};

const argValue = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
};

const outputDir = path.join(process.cwd(), ".tmp", "benchmarks", "parity");

// Stable JSON: Maps become sorted entry lists, selection IDs are dropped, and
// -0 is kept distinct from 0 so sign changes show up.
const canonical = (value: unknown): unknown => {
  if (value instanceof Map) {
    return { __map: [...value.entries()].map(([key, entry]) => [key, canonical(entry)]) };
  }
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return Array.from(value as ArrayLike<unknown>, canonical);
  }
  if (typeof value === "number") {
    return Object.is(value, -0) ? "-0" : Number.isNaN(value) ? "NaN" : value;
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (key === "selectionId") {
        continue;
      }
      const entry = (value as Record<string, unknown>)[key];
      if (typeof entry !== "function") {
        result[key] = canonical(entry);
      }
    }
    return result;
  }
  return value;
};

const digest = (value: unknown) => {
  const json = JSON.stringify(canonical(value));
  return { sha256: createHash("sha256").update(json).digest("hex"), bytes: json.length, sample: json.slice(0, 160) };
};

const COLOR_ACCESSORS = ["getColor", "getFillColor", "getLineColor", "getSourceColor", "getTargetColor"];

const compare = (labels: string[]) => {
  const [left, right] = labels.map((label) =>
    JSON.parse(readFileSync(path.join(outputDir, `${label}.json`), "utf8")),
  );
  let differences = 0;
  for (const [scenarioId, sections] of Object.entries<any>(left)) {
    for (const [section, value] of Object.entries<any>(sections)) {
      const other = right[scenarioId]?.[section];
      if (other?.sha256 !== value.sha256) {
        differences += 1;
        console.log(`DIFF ${scenarioId} ${section}\n  ${labels[0]}: ${value.sample}\n  ${labels[1]}: ${other?.sample}`);
      }
    }
  }
  const sections = Object.values<any>(left).reduce((sum, sections) => sum + Object.keys(sections).length, 0);
  console.log(`${differences} of ${sections} sections differ between ${labels.join(" and ")}`);
  process.exitCode = differences > 0 ? 1 : 0;
};

const main = async () => {
  const compareLabels = argValue("--compare", "");
  if (compareLabels) {
    compare(compareLabels.split(","));
    return;
  }

  const datasets = await import("./datasets");
  const { createSettings, buildLayers } = await import("./stages");
  const { createDatasetSnapshot } = await import("../../src/mapper");
  const { getGradientLegendSpecs } = await import("../../src/gradientLegend");
  const { aggregateScatterToH3Cells } = await import("../../src/layers/h3Hexagon");
  const label = argValue("--label", "working-tree");
  const filter = new RegExp(argValue("--filter", "."));
  const repoRoot = process.cwd();

  const tables: Record<string, any> = {};
  for (const name of datasets.HAMILTON_TABLES) {
    tables[name] = datasets.csvToTable(
      readFileSync(path.join(repoRoot, "samples", "hamilton", `${name}.csv`), "utf8"),
    );
  }

  // Extra objects exercise the other classification methods and H3.
  const variants: Array<[string, Record<string, Record<string, unknown>>]> = [
    ["default", {}],
    ["quantile-h3", {
      scatterProps: { fillGradientBinningMethod: "quantile" },
      polygonProps: { fillGradientBinningMethod: "quantile" },
      arcProps: { sourceGradientBinningMethod: "quantile", targetGradientBinningMethod: "natural-breaks" },
      h3HexagonProps: { showH3Hexagons: true, resolution: 9 },
    }],
  ];
  const scenarios = [
    ...datasets.HAMILTON_SCENARIOS.map((spec) => () => datasets.buildHamiltonScenario(spec, tables)),
    ...datasets.syntheticSpecs([10_000], ["wkt"]).flatMap((spec) =>
      variants.map(([variant, objects]) => () => {
        const scenario = datasets.buildSyntheticScenario(spec, undefined, objects);
        return { ...scenario, id: `${scenario.id}+${variant}` };
      }),
    ),
  ];

  const output: Record<string, Record<string, unknown>> = {};
  for (const build of scenarios) {
    const scenario = build();
    if (!filter.test(scenario.id)) {
      continue;
    }
    if (scenario.options.dataViews[0].categorical.values.some((column: any) => column.source.roles.wkp)) {
      continue;
    }
    const settings = createSettings(scenario.options);
    const warnings: string[] = [];
    const host = datasets.createMockHost({
      displayWarningIcon: (title: string, details: string) => warnings.push(`${title} ${details}`),
    });
    const snapshot = createDatasetSnapshot(scenario.options, settings, host, new Map(), "parity");
    const cache = new Map();
    const layers = buildLayers(snapshot, settings, cache, null);
    const colours: Record<string, unknown[]> = {};
    for (const layer of layers) {
      const data = Array.isArray(layer.props.data) ? layer.props.data : [];
      for (const name of COLOR_ACCESSORS) {
        const accessor = layer.props[name];
        if (accessor === undefined) {
          continue;
        }
        colours[`${layer.id}.${name}`] =
          typeof accessor === "function" ? data.map((item: unknown) => accessor(item)) : [accessor];
      }
    }
    output[scenario.id] = {
      rows: digest(snapshot.layers.all),
      paths: digest(snapshot.layers.path),
      polygons: digest(snapshot.layers.polygon),
      colorRoles: digest(snapshot.colorRoles),
      bounds: digest(snapshot.bounds),
      timeDomain: digest(snapshot.timeDomain),
      highlights: digest(snapshot.dataHighlightedIds),
      warnings: digest(warnings),
      layerColours: digest(colours),
      layerData: digest(layers.map((layer) => ({ id: layer.id, data: layer.props.data }))),
      legend: digest(getGradientLegendSpecs(snapshot.layers, settings, scenario.options.dataViews[0], cache, snapshot.version, snapshot.colorRoles)),
      h3: digest([7, 9].map((resolution) => aggregateScatterToH3Cells(snapshot.layers.scatter, resolution))),
    };
    console.log(`[parity] ${scenario.id}`);
  }

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, `${label}.json`), JSON.stringify(output, null, 1));
  console.log(`[parity] wrote ${label}.json`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
