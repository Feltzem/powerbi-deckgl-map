/**
 * Decides whether the visual should ask Power BI for another fetchMoreData segment. Power BI's own limits are
 * 1,048,576 rows and 100 MB per data view; this adds a user-set row cap and a memory budget so a large report
 * degrades to "showing the first N rows" instead of freezing or crashing the tab.
 */

export type LoadStopReason = "rows" | "memory";

export interface LoadBudgetInput {
  rows: number;
  maxRows: number;
  /** Current JS heap in bytes, or null where the host doesn't report it. */
  heapBytes: number | null;
  /** Heap when this load started (the Create update), or null. */
  baselineHeapBytes: number | null;
  budgetMb: number;
}

export interface LoadBudgetDecision {
  stop: boolean;
  reason: LoadStopReason | null;
  message: string | null;
}

const format = (n: number) => Math.round(n).toLocaleString("en-NZ");

export function checkLoadBudget(input: LoadBudgetInput): LoadBudgetDecision {
  if (input.rows >= input.maxRows) {
    return {
      stop: true,
      reason: "rows",
      message: `Showing the first ${format(input.rows)} rows (Max rows to load). Filter or aggregate the data to see the rest.`,
    };
  }
  if (input.heapBytes !== null && input.baselineHeapBytes !== null) {
    const grownMb = (input.heapBytes - input.baselineHeapBytes) / 1e6;
    if (grownMb >= input.budgetMb) {
      return {
        stop: true,
        reason: "memory",
        message: `Showing the first ${format(input.rows)} rows: memory grew ${format(grownMb)} MB, past the ${format(input.budgetMb)} MB budget. Filter or aggregate the data to see the rest.`,
      };
    }
  }
  return { stop: false, reason: null, message: null };
}

/** Chromium hosts expose `performance.memory`; others return null and only the row cap applies. */
export function readHeapBytes(): number | null {
  const memory = (globalThis.performance as unknown as { memory?: { usedJSHeapSize?: number } } | undefined)?.memory;
  return typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize : null;
}
