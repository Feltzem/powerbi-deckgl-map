import { TimeDomain } from "./time";

/**
 * Per-frame animation state passed to the layer builders. `active` is false
 * when no timestamp is bound, in which case layers render exactly as before.
 */
export interface AnimationContext {
  active: boolean;
  domain: TimeDomain;
  /** Current playhead in Unix seconds. */
  time: number;
  trailLength: number;
  maxHeight: number;
}

export interface AnimationConfig {
  /** Simulated seconds advanced per real second of wall-clock playback. */
  animationSpeed: number;
  /** Restart from t0 when the playhead passes t1. */
  loop: boolean;
}

/**
 * Pure advance step shared by the RAF loop and the unit tests.
 *
 * Given the current sim time, the elapsed real seconds since the last frame,
 * the domain, and the config, returns the next sim time. When the playhead
 * reaches t1 it either wraps to t0 (loop) or clamps at t1 (loop off).
 */
export const advanceTime = (
  current: number,
  realDeltaSeconds: number,
  domain: TimeDomain,
  config: AnimationConfig,
): number => {
  const { t0, t1 } = domain;
  const speed = Number.isFinite(config.animationSpeed)
    ? Math.max(0, config.animationSpeed)
    : 0;
  const delta = Number.isFinite(realDeltaSeconds)
    ? Math.max(0, realDeltaSeconds)
    : 0;
  let next = current + speed * delta;
  if (next > t1) {
    next = config.loop ? t0 : t1;
  }
  if (next < t0) {
    next = t0;
  }
  return next;
};

type Now = () => number;

/**
 * Drives a sim clock with requestAnimationFrame. Delta-based (via the supplied
 * `now`, defaulting to performance.now) so playback speed stays accurate
 * regardless of frame rate. The controller is inert until `start` is called
 * with a domain, and reports each new time through `onTick`.
 */
export class TimeAnimationController {
  private domain: TimeDomain | null = null;
  private config: AnimationConfig = { animationSpeed: 60, loop: true };
  private time = 0;
  private playing = false;
  private rafHandle: number | null = null;
  private lastTickMs: number | null = null;

  constructor(
    private readonly onTick: (time: number) => void,
    private readonly requestFrame: (cb: () => void) => number = (cb) =>
      requestAnimationFrame(cb),
    private readonly cancelFrame: (handle: number) => void = (handle) =>
      cancelAnimationFrame(handle),
    private readonly now: Now = () =>
      typeof performance !== "undefined" ? performance.now() : Date.now(),
  ) {}

  getTime(): number {
    return this.time;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Apply the current domain and config. Clamps the playhead into the new
   * domain and resets to t0 when the domain identity changes (new dataset).
   */
  setDomain(domain: TimeDomain | null): void {
    const changed =
      !this.domain ||
      !domain ||
      this.domain.t0 !== domain.t0 ||
      this.domain.t1 !== domain.t1;
    this.domain = domain;
    if (!domain) {
      this.stop();
      this.time = 0;
      return;
    }
    if (changed) {
      this.time = domain.t0;
    } else {
      this.time = Math.min(domain.t1, Math.max(domain.t0, this.time));
    }
  }

  setConfig(config: AnimationConfig): void {
    this.config = config;
  }

  /**
   * Jump the playhead to a specific time (clamped into the domain), e.g. from a
   * time-slider scrub. Resets the delta baseline so a subsequent play frame does
   * not jump, and reports the new time through onTick so the visual re-renders.
   * No-op without a domain.
   */
  seek(time: number): void {
    if (!this.domain || !Number.isFinite(time)) {
      return;
    }
    const next = Math.min(this.domain.t1, Math.max(this.domain.t0, time));
    this.lastTickMs = null;
    if (next !== this.time) {
      this.time = next;
      this.onTick(next);
    }
  }

  /** Begin (or continue) playback. No-op without a domain. */
  play(): void {
    if (!this.domain || this.playing) {
      return;
    }
    this.playing = true;
    this.lastTickMs = null;
    this.scheduleFrame();
  }

  /** Pause playback, leaving the playhead where it is. */
  pause(): void {
    this.playing = false;
    this.lastTickMs = null;
    if (this.rafHandle !== null) {
      this.cancelFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  /** Pause and forget the domain (used on teardown / empty data). */
  stop(): void {
    this.pause();
  }

  private scheduleFrame(): void {
    this.rafHandle = this.requestFrame(() => this.frame());
  }

  private frame(): void {
    this.rafHandle = null;
    if (!this.playing || !this.domain) {
      return;
    }
    const tickMs = this.now();
    const realDelta =
      this.lastTickMs === null ? 0 : (tickMs - this.lastTickMs) / 1000;
    this.lastTickMs = tickMs;

    const next = advanceTime(this.time, realDelta, this.domain, this.config);
    const changed = next !== this.time;
    this.time = next;
    if (changed) {
      this.onTick(next);
    }

    // When not looping and the playhead has reached t1 (after at least one real
    // delta), playback is finished; stop scheduling frames so we don't burn a
    // RAF every tick doing nothing. The initial baseline frame (realDelta === 0)
    // is exempt so play() from t1 with a fresh domain still settles correctly.
    if (
      !this.config.loop &&
      !changed &&
      realDelta > 0 &&
      this.time >= this.domain.t1
    ) {
      this.playing = false;
      this.lastTickMs = null;
      return;
    }

    this.scheduleFrame();
  }
}
