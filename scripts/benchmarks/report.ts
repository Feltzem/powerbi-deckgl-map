// Turns stage and end-to-end JSON results into the markdown tables used in
// BENCHMARKS.md. With --compare, prints before/after columns for two labels.
//
//   npm run bench:report -- --label baseline
//   npm run bench:report -- --label after --compare baseline

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const argValue = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
};

const root = path.join(process.cwd(), ".tmp", "benchmarks");
const readJson = (filePath: string): any =>
  existsSync(filePath) ? JSON.parse(readFileSync(filePath, "utf8")) : null;

const label = argValue("--label", "baseline");
const compareLabel = argValue("--compare", "");

const load = (name: string) => ({
  node: readJson(path.join(root, "stages", `node-${name}.json`)),
  chrome:
    readJson(path.join(root, "browser-results", `chrome-both-${name}.json`)) ??
    readJson(path.join(root, "browser-results", `chrome-e2e-${name}.json`)),
});

const current = load(label);
const previous = compareLabel ? load(compareLabel) : null;

const ms = (value: number | null | undefined): string =>
  value === null || value === undefined || Number.isNaN(value)
    ? "–"
    : value >= 100
      ? value.toFixed(0)
      : value >= 10
        ? value.toFixed(1)
        : value.toFixed(2);

const median = (values: number[]): number | null => {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const stageMedian = (result: any, stage: string): number | null =>
  result?.stages?.find((entry: any) => entry.stage === stage)?.medianMs ?? null;

const STAGE_COLUMNS: Array<[string, string]> = [
  ["parse.total", "Parse"],
  ["parse.geometry.wkt", "WKT"],
  ["parse.geometry.wkp", "WKP"],
  ["parse.colorInput", "Colour parse ×1"],
  ["validate", "Validate"],
  ["bounds", "Bounds"],
  ["classify.quantile", "Quantile"],
  ["classify.natural-breaks", "Jenks"],
  ["h3.aggregate.r7", "H3 r7"],
  ["time.windowMask", "Time mask (CPU ref)"],
  ["layers.build", "Layer build"],
  ["colour.accessorSweep", "Colour accessors"],
  ["legend.specs", "Legend"],
];

const stageTable = (results: any[], previousResults: any[] | null) => {
  const lines = [
    `| Scenario | Rows | ${STAGE_COLUMNS.map(([, title]) => title).join(" | ")} |`,
    `|---|---:|${STAGE_COLUMNS.map(() => "---:").join("|")}|`,
  ];
  for (const result of results) {
    if (!result?.stages?.length) {
      lines.push(`| ${result?.id} | ${result?.rowCount?.toLocaleString("en-NZ") ?? ""} | skipped: ${result?.skipped ?? result?.error ?? "no result"} |`);
      continue;
    }
    const before = previousResults?.find((candidate) => candidate?.id === result.id);
    const cells = STAGE_COLUMNS.map(([stage]) => {
      const after = stageMedian(result, stage);
      if (!before) {
        return ms(after);
      }
      const baseline = stageMedian(before, stage);
      return baseline === null && after === null ? "–" : `${ms(baseline)} → ${ms(after)}`;
    });
    lines.push(`| ${result.id} | ${result.rowCount.toLocaleString("en-NZ")} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
};

const e2eSummary = (run: any) => {
  const samples = (run.samples ?? []).filter((sample: any) => !sample.error);
  const pick = (key: string) => median(samples.map((sample: any) => sample[key]).filter((value: any) => typeof value === "number"));
  const layerTotals: Record<string, number[]> = {};
  for (const sample of samples) {
    for (const [id, value] of Object.entries(sample.layerUpdateMs ?? {})) {
      (layerTotals[id] ??= []).push(value as number);
    }
  }
  const layerUpdate = Object.values(layerTotals).reduce((sum, values) => sum + (median(values) ?? 0), 0);
  const topLayer = Object.entries(layerTotals)
    .map(([id, values]) => [id, median(values) ?? 0] as const)
    .sort((a, b) => b[1] - a[1])[0];
  return {
    ok: samples.length,
    errors: (run.samples ?? []).length - samples.length,
    error: (run.samples ?? []).find((sample: any) => sample.error)?.error,
    updateCall: pick("updateCallMs"),
    parse: pick("parseMs"),
    renderBuild: pick("renderBuildMs"),
    deckFrame: pick("deckFrameCpuToFirstDrawMs"),
    layerUpdate,
    topLayer,
    firstDraw: pick("firstDrawGpuSyncedMs"),
    heapMb: (pick("heapDeltaBytes") ?? 0) / 1e6,
    rowCount: samples[0]?.rowCount,
    animation: samples[0]?.animation,
  };
};

const e2eTable = (runs: any[], previousRuns: any[] | null) => {
  const lines = [
    "| Scenario | Rows | update() | of which parse | layer build + legend | deck first frame CPU | of which layer updates | heaviest sublayer | Data change → first draw (GPU synced) | JS heap Δ MB |",
    "|---|---:|---:|---:|---:|---:|---:|---|---:|---:|",
  ];
  for (const run of runs.filter((candidate) => !candidate.animate)) {
    const now = e2eSummary(run);
    const beforeRun = previousRuns?.find((candidate) => candidate.key === run.key && !candidate.animate);
    const before = beforeRun ? e2eSummary(beforeRun) : null;
    const cell = (key: keyof ReturnType<typeof e2eSummary>) =>
      before ? `${ms(before[key] as number)} → ${ms(now[key] as number)}` : ms(now[key] as number);
    if (now.ok === 0) {
      lines.push(`| ${run.key} | | failed: ${String(now.error).slice(0, 80)} |`);
      continue;
    }
    lines.push(
      `| ${run.key.replace(/^\w+:/, "")} | ${now.rowCount?.toLocaleString("en-NZ")} | ${cell("updateCall")} | ${cell("parse")} | ${cell("renderBuild")} | ${cell("deckFrame")} | ${cell("layerUpdate")} | ${now.topLayer ? `${now.topLayer[0]} ${ms(now.topLayer[1])}` : "–"} | ${cell("firstDraw")} | ${now.heapMb.toFixed(0)} |`,
    );
  }
  return lines.join("\n");
};

const animationTable = (runs: any[]) => {
  const lines = [
    "| Scenario | Rows | Visual tick p50 / p95 ms | deck frame p50 / p95 ms | rAF interval p50 / p95 ms | Dropped frames |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const run of runs.filter((candidate) => candidate.animate)) {
    const summary = e2eSummary(run);
    const animation = summary.animation;
    if (!animation) {
      lines.push(`| ${run.key} | | failed: ${String(summary.error).slice(0, 80)} |`);
      continue;
    }
    lines.push(
      `| ${run.key.replace(/^\w+:/, "")} | ${summary.rowCount?.toLocaleString("en-NZ")} | ${ms(animation.visualTickMs.p50)} / ${ms(animation.visualTickMs.p95)} | ${ms(animation.deckFrameMs.p50)} / ${ms(animation.deckFrameMs.p95)} | ${ms(animation.rafIntervalMs.p50)} / ${ms(animation.rafIntervalMs.p95)} | ${animation.droppedFramePercent?.toFixed(1)}% |`,
    );
  }
  return lines.join("\n");
};

const sections: string[] = [];
if (current.chrome?.stages) {
  sections.push(`### Stage timings, Chrome (median ms)\n\n${stageTable(current.chrome.stages, previous?.chrome?.stages ?? null)}`);
}
if (current.node?.results) {
  sections.push(`### Stage timings, Node ${current.node.nodeVersion} (median ms)\n\n${stageTable(current.node.results, previous?.node?.results ?? null)}`);
}
if (current.chrome?.e2e) {
  sections.push(`### End to end, packaged visual.js in Chrome (median of runs, ms)\n\n${e2eTable(current.chrome.e2e, previous?.chrome?.e2e ?? null)}`);
  sections.push(`### Animation frame time\n\n${animationTable(current.chrome.e2e)}`);
}
console.log(sections.join("\n\n"));
