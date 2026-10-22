// Node runner for the per-stage benchmarks. WKP scenarios are skipped here
// because the patched WKP loader only works in the browser; the browser
// runner covers them.
//
//   npm run bench:stages -- --label baseline --sizes 10000,100000,500000

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

(globalThis as any).powerbi ??= {
  visuals: { ValidatorType: { Min: "Min", Max: "Max" } },
};

const argValue = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
};

const main = async () => {
  const datasets = await import("./datasets");
  const { runScenarioStages } = await import("./stages");
  const repoRoot = process.cwd();
  const label = argValue("--label", "working-tree");
  const sizes = argValue("--sizes", "10000,100000,500000").split(",").map(Number);
  const filter = new RegExp(argValue("--filter", "."));
  datasets.dataViewShape.singleGroup = !process.argv.includes("--no-grouped");
  const gc = typeof global.gc === "function" ? () => global.gc!() : undefined;

  const tables: Record<string, any> = {};
  for (const name of datasets.HAMILTON_TABLES) {
    tables[name] = datasets.csvToTable(
      readFileSync(path.join(repoRoot, "samples", "hamilton", `${name}.csv`), "utf8"),
    );
  }

  const scenarioFactories = [
    ...datasets.HAMILTON_SCENARIOS.map((spec) => ({
      id: spec.id,
      build: () => datasets.buildHamiltonScenario(spec, tables),
    })),
    ...datasets.syntheticSpecs(sizes, ["wkt"]).map((spec) => ({
      id: datasets.syntheticScenarioId(spec),
      build: () => datasets.buildSyntheticScenario(spec),
    })),
  ].filter((factory) => filter.test(factory.id));

  const results = [];
  const startedAt = new Date().toISOString();
  const outputDir = path.join(repoRoot, ".tmp", "benchmarks", "stages");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `node-${label}.json`);
  // Written after every scenario so a crash at 500k rows keeps earlier results.
  const writeResults = () =>
    writeFileSync(
      outputPath,
      JSON.stringify(
        {
          label,
          environment: "node",
          singleGroup: datasets.dataViewShape.singleGroup,
          nodeVersion: process.version,
          cpu: os.cpus()[0]?.model,
          platform: `${os.platform()} ${os.release()}`,
          startedAt,
          results,
        },
        null,
        2,
      ),
    );
  for (const factory of scenarioFactories) {
    const started = performance.now();
    const scenario = factory.build();
    const result = runScenarioStages(scenario, { gc });
    results.push(result);
    const parse = result.stages.find((stage) => stage.stage === "parse.total");
    console.log(
      `[stages] ${factory.id}: ${result.skipped ? `skipped (${result.skipped})` : `parse ${parse?.medianMs.toFixed(1)} ms`} [${((performance.now() - started) / 1000).toFixed(1)} s]`,
    );
    writeResults();
  }

  writeResults();
  console.log(`[stages] wrote ${outputPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
