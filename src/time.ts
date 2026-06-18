import powerbi from "powerbi-visuals-api";

type PrimitiveValue = powerbi.PrimitiveValue;

/**
 * Normalise a bound `timestamp` value to Unix seconds.
 *
 * Power BI can hand us a Date (datetime column), a number, or a string:
 * - Date            -> epoch milliseconds / 1000.
 * - number          -> treated as already being in seconds (per the role
 *                      description); the visual's height/window maths is in
 *                      seconds, so a numeric column is assumed pre-converted.
 * - string          -> parsed as a date.
 *
 * Returns null for blank/unparseable values so callers can skip the row.
 */
export const toUnixSeconds = (
  value: PrimitiveValue | null | undefined,
): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms / 1000 : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = new Date(value as string).getTime();
  return Number.isFinite(parsed) ? parsed / 1000 : null;
};

export interface TimeDomain {
  /** Earliest timestamp in seconds. */
  t0: number;
  /** Latest timestamp in seconds (always > t0). */
  t1: number;
}

/**
 * Compute the [t0, t1] domain from a set of per-row timestamps in seconds,
 * ignoring nulls. Returns null when fewer than one finite timestamp exists.
 * t1 is nudged to t0 + 1 when all timestamps collapse to a single instant so
 * downstream divisions by (t1 - t0) stay finite.
 */
export const computeTimeDomain = (
  timestamps: Array<number | null>,
): TimeDomain | null => {
  let min = Infinity;
  let max = -Infinity;
  for (const t of timestamps) {
    if (t === null || !Number.isFinite(t)) {
      continue;
    }
    if (t < min) min = t;
    if (t > max) max = t;
  }
  if (min === Infinity) {
    return null;
  }
  return { t0: min, t1: Math.max(min + 1, max) };
};
