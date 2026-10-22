// Samples the V8 CPU profiler while one scenario runs createDatasetSnapshot
// and the layer factories, then prints self time by function. The code runs
// from an unminified esbuild bundle that keeps function names, and each
// bundle line maps back to its source file through esbuild's path comments.
//
//   npm run bench:profile -- --scenario hamilton-crash-scatter
//   npm run bench:profile -- --scenario polygon-wkt-numeric-100k

import { Session } from "node:inspector/promises";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";

(globalThis as any).powerbi ??= {
  visuals: { ValidatorType: { Min: "Min", Max: "Max" } },
};

const argValue = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
};

const repoRoot = process.cwd();
const bundlePath = path.join(repoRoot, ".tmp", "benchmarks", "profile", "profile-bundle.cjs");

const bundleEntry = async () => {
  mkdirSync(path.dirname(bundlePath), { recursive: true });
  await build({
    entryPoints: [path.join(repoRoot, "scripts", "benchmarks", "profile-entry.ts")],
    outfile: bundlePath,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    keepNames: true,
    minify: false,
    external: ["powerbi-visuals-api"],
    logLevel: "warning",
  });
};

// esbuild opens each module's code with a "// <relative path>" comment.
const buildLineToSource = (): string[] => {
  const lines = readFileSync(bundlePath, "utf8").split("\n");
  const sources: string[] = [];
  let current = "(bundle)";
  for (const line of lines) {
    const marker = /^\/\/ (\S+\.(?:ts|js|cjs|mjs))$/.exec(line);
    if (marker) {
      current = marker[1].replace(/^(\.\.\/)+/, "");
    }
    sources.push(current);
  }
  return sources;
};

const main = async () => {
  await bundleEntry();
  const bundle = createRequire(import.meta.url)(bundlePath);
  const { datasets, createSettings, buildLayers, createDatasetSnapshot } = bundle;
  const scenarioId = argValue("--scenario", "hamilton-crash-scatter");
  const iterations = Number(argValue("--iterations", "5"));
  const top = Number(argValue("--top", "25"));

  const hamilton = datasets.HAMILTON_SCENARIOS.find((spec: any) => spec.id === scenarioId);
  let scenario;
  if (hamilton) {
    const tables: Record<string, any> = {};
    for (const name of hamilton.tables) {
      tables[name] = datasets.csvToTable(
        readFileSync(path.join(repoRoot, "samples", "hamilton", `${name}.csv`), "utf8"),
      );
    }
    scenario = datasets.buildHamiltonScenario(hamilton, tables);
  } else {
    const spec = datasets
      .syntheticSpecs()
      .find((candidate: any) => datasets.syntheticScenarioId(candidate) === scenarioId);
    if (!spec) {
      throw new Error(`Unknown scenario ${scenarioId}`);
    }
    scenario = datasets.buildSyntheticScenario(spec);
  }

  const settings = createSettings(scenario.options);
  const host = datasets.createMockHost();
  const run = (index: number) => {
    const snapshot = createDatasetSnapshot(scenario.options, settings, host, new Map(), `profile-${index}`);
    buildLayers(snapshot, settings, new Map(), null);
  };
  run(-1);

  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: 100 });
  await session.post("Profiler.start");
  for (let index = 0; index < iterations; index += 1) {
    run(index);
  }
  const { profile } = await session.post("Profiler.stop");
  session.disconnect();

  const lineToSource = buildLineToSource();
  const sampleCounts = new Map<number, number>();
  for (const id of profile.samples ?? []) {
    sampleCounts.set(id, (sampleCounts.get(id) ?? 0) + 1);
  }
  const totalSamples = profile.samples?.length ?? 1;
  const totalMs = (profile.endTime - profile.startTime) / 1000;
  const selfByFunction = new Map<string, number>();
  for (const node of profile.nodes) {
    const frame = node.callFrame;
    const inBundle = frame.url.endsWith("profile-bundle.cjs");
    const source = inBundle
      ? `${lineToSource[frame.lineNumber] ?? "(bundle)"} (bundle:${frame.lineNumber + 1})`
      : frame.url || "(native)";
    const key = `${frame.functionName || "(anonymous)"}  ${source}`;
    selfByFunction.set(key, (selfByFunction.get(key) ?? 0) + (sampleCounts.get(node.id) ?? 0));
  }

  console.log(`${scenarioId}: ${iterations} runs, ${(totalMs / iterations).toFixed(1)} ms per run`);
  console.log("self %   ms/run  function");
  for (const [key, samples] of [...selfByFunction.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)) {
    const share = samples / totalSamples;
    console.log(
      `${(share * 100).toFixed(1).padStart(5)}  ${((share * totalMs) / iterations).toFixed(2).padStart(7)}  ${key}`,
    );
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
