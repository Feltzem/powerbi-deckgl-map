import type { AnimationContext } from "./timeAnimation";

// Plausible epoch-seconds window: 1990-01-01 .. 2100-01-01. A bound datetime
// normalizes into this range; arbitrary numeric timestamps (e.g. 42, or large
// non-epoch counters) fall outside it.
const EPOCH_MIN_SECONDS = 631152000;
const EPOCH_MAX_SECONDS = 4102444800;

const timeFormatOptions: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};
const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 3,
});

/**
 * Format a normalized playhead time (Unix seconds) for display.
 *
 * We only persist the normalized number, not whether the source column was a
 * datetime, so we infer it: values inside the plausible epoch window render as
 * a localized date/time; everything else renders as a raw number (the source
 * was almost certainly an arbitrary numeric, and a 1970-relative date would be
 * misleading).
 *
 * Tradeoff: this misclassifies genuine datetimes outside 1990-2100 and numeric
 * sources that happen to land inside the window. Both are edge cases; the
 * honest alternative is threading a source-type flag through the mapper, which
 * is out of scope for showing the current time.
 */
export const formatAnimationTime = (timeSeconds: number): string => {
  if (!Number.isFinite(timeSeconds)) {
    return "";
  }
  if (timeSeconds >= EPOCH_MIN_SECONDS && timeSeconds <= EPOCH_MAX_SECONDS) {
    return new Date(timeSeconds * 1000).toLocaleString(
      undefined,
      timeFormatOptions,
    );
  }
  return numberFormatter.format(timeSeconds);
};

/**
 * Banner HTML showing the current animation playhead time, or null when there
 * is no active animation context. The label is derived from a number via Intl
 * formatters (never a user-supplied string), so it needs no escaping, mirroring
 * getH3HexagonTooltipHtml.
 */
export const getAnimationTimeTooltipHtml = (
  animation: AnimationContext | null,
): string | null => {
  if (!animation || !animation.active) {
    return null;
  }
  const label = formatAnimationTime(animation.time);
  if (!label) {
    return null;
  }
  return `<div class="deckgl-animation-time-tooltip"><strong>Time</strong><br>${label}</div>`;
};
