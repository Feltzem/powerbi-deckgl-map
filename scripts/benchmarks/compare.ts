import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runBenchmarkSuite, BenchmarkRunResult } from "./run";

interface MetricComparison {
  scenarioId: string;
  colorMode: string;
  metricName: string;
  baselineMs: number | null;
  candidateMs: number | null;
  deltaMs: number | null;
  deltaPercent: number | null;
  candidateCalls?: number;
  candidateFunctionCalls?: number;
  candidateConstantCalls?: number;
  candidateNsPerFunctionCall?: number | null;
}

const repoRoot = process.cwd();
const worktreeRoot = path.join(repoRoot, ".tmp", "benchmarks", "worktrees");
const resultsRoot = path.join(repoRoot, ".tmp", "benchmarks", "results");
const refs = ["v1.5.3.0", "v1.5.4.0"];

const runGit = (args: string[]) =>
  execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const safeRefName = (ref: string): string => ref.replace(/[^a-zA-Z0-9_.-]/g, "-");

const removeWorktree = (worktreePath: string) => {
  if (!existsSync(worktreePath)) {
    return;
  }

  try {
    runGit(["worktree", "remove", "--force", worktreePath]);
  } catch {
    rmSync(worktreePath, { recursive: true, force: true });
    try {
      runGit(["worktree", "prune"]);
    } catch {
      // Best-effort cleanup only.
    }
  }
};

const createWorktree = (ref: string): string => {
  mkdirSync(worktreeRoot, { recursive: true });
  const worktreePath = path.join(worktreeRoot, safeRefName(ref));
  removeWorktree(worktreePath);
  runGit(["worktree", "add", "--detach", worktreePath, ref]);
  return worktreePath;
};

const getScenarioMetric = (
  result: BenchmarkRunResult,
  scenarioId: string,
  metricName: string,
): number | null => {
  const scenario = result.scenarios.find((item) => item.scenario.id === scenarioId);
  const metric = scenario?.metrics?.[metricName];
  return metric?.elapsedMs ?? null;
};

const compareRuns = (
  baseline: BenchmarkRunResult,
  candidate: BenchmarkRunResult,
): MetricComparison[] => {
  const comparisons: MetricComparison[] = [];
  const metricNames = [
    "parseCold",
    "parseWarm",
    "classification",
    "legendSpecs",
    "layerConstruction",
    "colorAccessorSweep",
  ];

  for (const scenario of candidate.scenarios) {
    for (const metricName of metricNames) {
      const baselineMs = getScenarioMetric(baseline, scenario.scenario.id, metricName);
      const candidateMetric = scenario.metrics[metricName];
      const candidateMs = candidateMetric?.elapsedMs ?? null;
      const deltaMs =
        baselineMs === null || candidateMs === null ? null : candidateMs - baselineMs;
      const deltaPercent =
        baselineMs === null || candidateMs === null || baselineMs === 0
          ? null
          : (deltaMs! / baselineMs) * 100;

      comparisons.push({
        scenarioId: scenario.scenario.id,
        colorMode: scenario.scenario.colorMode,
        metricName,
        baselineMs,
        candidateMs,
        deltaMs,
        deltaPercent,
        candidateCalls: candidateMetric?.calls,
        candidateFunctionCalls: candidateMetric?.functionCalls,
        candidateConstantCalls: candidateMetric?.constantCalls,
        candidateNsPerFunctionCall: candidateMetric?.nsPerFunctionCall,
      });
    }
  }

  return comparisons;
};

const writeComparisonMarkdown = (
  results: BenchmarkRunResult[],
  comparisons: Record<string, MetricComparison[]>,
) => {
  const lines = [
    "# Benchmark Comparison",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Runs",
    "",
    "| Label | Commit | Scenarios |",
    "|---|---:|---:|",
    ...results.map(
      (result) =>
        `| ${result.label} | ${result.commit} | ${result.scenarios.length} |`,
    ),
    "",
  ];

  addKeyColorAccessorSummary(lines, comparisons);

  for (const [label, items] of Object.entries(comparisons)) {
    lines.push(`## ${label}`, "");
    lines.push(
      "| Scenario | Colour mode | Metric | Baseline ms | Candidate ms | Delta % | Calls | Fn calls | Const calls | ns/fn call |",
      "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    );
    for (const item of items) {
      lines.push(
        `| ${item.scenarioId} | ${item.colorMode} | ${item.metricName} | ${formatNumber(
          item.baselineMs,
        )} | ${formatNumber(item.candidateMs)} | ${formatNumber(
          item.deltaPercent,
        )} | ${formatInteger(item.candidateCalls)} | ${formatInteger(
          item.candidateFunctionCalls,
        )} | ${formatInteger(item.candidateConstantCalls)} | ${formatNumber(
          item.candidateNsPerFunctionCall,
        )} |`,
      );
    }
    lines.push("");
  }

  writeFileSync(
    path.join(resultsRoot, "benchmark-comparison.md"),
    `${lines.join("\n")}\n`,
  );
};

const keyColorAccessorScenarios = [
  { scenarioId: "arc-default-65k", label: "default 65k" },
  { scenarioId: "arc-hex-65k", label: "hex 65k" },
  { scenarioId: "arc-rgba-65k", label: "rgba 65k" },
  { scenarioId: "arc-numeric-equal-65k", label: "numeric equal 65k" },
  { scenarioId: "arc-numeric-quantile-65k", label: "numeric quantile 65k" },
  { scenarioId: "arc-selection-fade-65k", label: "selection fade 65k" },
];

const addKeyColorAccessorSummary = (
  lines: string[],
  comparisons: Record<string, MetricComparison[]>,
) => {
  const workingTreeComparison = comparisons["working-tree vs v1.5.3.0"] ?? [];
  if (workingTreeComparison.length === 0) {
    return;
  }

  lines.push(
    "## Key Colour Accessor Sweep Results",
    "",
    "These rows are extracted from `colorAccessorSweep` in `working-tree vs v1.5.3.0`.",
    "",
    "| Scenario | Colour mode | Before ms | After ms | Change | Fn calls | Const calls |",
    "|---|---|---:|---:|---:|---:|---:|",
  );

  for (const scenario of keyColorAccessorScenarios) {
    const item = workingTreeComparison.find(
      (comparison) =>
        comparison.scenarioId === scenario.scenarioId &&
        comparison.metricName === "colorAccessorSweep",
    );
    lines.push(
      `| ${scenario.label} | ${item?.colorMode ?? ""} | ${formatNumber(
        item?.baselineMs,
      )} | ${formatNumber(item?.candidateMs)} | ${formatPercent(
        item?.deltaPercent,
      )} | ${formatInteger(item?.candidateFunctionCalls)} | ${formatInteger(
        item?.candidateConstantCalls,
      )} |`,
    );
  }

  lines.push("");
};

const formatNumber = (value?: number | null): string =>
  value === null || value === undefined ? "" : value.toFixed(2);

const formatInteger = (value?: number): string =>
  typeof value === "number" ? Math.round(value).toLocaleString("en-NZ") : "";

const formatPercent = (value?: number | null): string =>
  value === null || value === undefined ? "" : `${value.toFixed(2)}%`;

const main = async () => {
  mkdirSync(resultsRoot, { recursive: true });
  const results: BenchmarkRunResult[] = [];
  const worktrees: string[] = [];

  try {
    for (const ref of refs) {
      const worktreePath = createWorktree(ref);
      worktrees.push(worktreePath);
      results.push(
        await runBenchmarkSuite({
          repoPath: worktreePath,
          label: ref,
          outputDir: resultsRoot,
        }),
      );
    }

    results.push(
      await runBenchmarkSuite({
        repoPath: repoRoot,
        label: "working-tree",
        outputDir: resultsRoot,
      }),
    );

    const baseline = results.find((result) => result.label === "v1.5.3.0")!;
    const comparisons = {
      "v1.5.4.0 vs v1.5.3.0": compareRuns(
        baseline,
        results.find((result) => result.label === "v1.5.4.0")!,
      ),
      "working-tree vs v1.5.3.0": compareRuns(
        baseline,
        results.find((result) => result.label === "working-tree")!,
      ),
    };

    writeFileSync(
      path.join(resultsRoot, "benchmark-comparison.json"),
      JSON.stringify({ results, comparisons }, null, 2),
    );
    writeComparisonMarkdown(results, comparisons);
    console.log(`[bench] wrote comparison outputs to ${resultsRoot}`);
  } finally {
    for (const worktreePath of worktrees.reverse()) {
      removeWorktree(worktreePath);
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
