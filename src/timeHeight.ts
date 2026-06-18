import { TimeDomain } from "./time";

/**
 * Map a timestamp to a height using the same linear time-as-height encoding as
 * the Parking review page: z = (t - t0) / (t1 - t0) * maxHeight.
 *
 * Returns 0 for null/non-finite timestamps so a row without a usable time sits
 * on the ground rather than disappearing.
 */
export const timestampToHeight = (
  timestampSeconds: number | null,
  domain: TimeDomain,
  maxHeight: number,
): number => {
  if (timestampSeconds === null || !Number.isFinite(timestampSeconds)) {
    return 0;
  }
  const span = domain.t1 - domain.t0;
  if (span <= 0) {
    return 0;
  }
  const fraction = (timestampSeconds - domain.t0) / span;
  const clamped = Math.max(0, Math.min(1, fraction));
  return clamped * maxHeight;
};

/**
 * Whether a timestamp falls inside the trailing window [time - trailLength,
 * time]. Rows without a usable timestamp are always considered visible so that
 * static (non-animated) geometry mixed into the same dataset keeps rendering.
 */
export const isWithinTrailingWindow = (
  timestampSeconds: number | null,
  time: number,
  trailLength: number,
): boolean => {
  if (timestampSeconds === null || !Number.isFinite(timestampSeconds)) {
    return true;
  }
  const start = time - Math.max(0, trailLength);
  return timestampSeconds >= start && timestampSeconds <= time;
};
