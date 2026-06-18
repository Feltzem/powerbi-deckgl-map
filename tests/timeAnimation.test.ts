import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceTime,
  resolveAnimationSpeed,
  TimeAnimationController,
} from "../src/timeAnimation";

const domain = { t0: 0, t1: 100 };

test("advanceTime moves forward by speed * delta", () => {
  assert.equal(
    advanceTime(0, 0.5, domain, { animationSpeed: 60, loop: true }),
    30,
  );
});

test("advanceTime wraps with overshoot past t1 when looping", () => {
  assert.equal(
    advanceTime(99, 1, domain, { animationSpeed: 60, loop: true }),
    59,
  );
});

test("advanceTime clamps at t1 when not looping", () => {
  assert.equal(
    advanceTime(99, 1, domain, { animationSpeed: 60, loop: false }),
    100,
  );
});

test("advanceTime ignores negative/NaN deltas and speeds", () => {
  assert.equal(advanceTime(50, -5, domain, { animationSpeed: 60, loop: true }), 50);
  assert.equal(
    advanceTime(50, Number.NaN, domain, { animationSpeed: 60, loop: true }),
    50,
  );
  assert.equal(
    advanceTime(50, 1, domain, { animationSpeed: Number.NaN, loop: true }),
    50,
  );
});

test("resolveAnimationSpeed: duration mode fits the span into the duration", () => {
  // 100s span played over 20s -> 5 sim-sec per real-sec.
  assert.equal(
    resolveAnimationSpeed({
      durationMode: true,
      durationSeconds: 20,
      multiplier: 60,
      domain,
    }),
    5,
  );
  // A multi-year span plays in the same duration -> a much larger speed.
  const wide = { t0: 0, t1: 205_000_000 };
  assert.equal(
    resolveAnimationSpeed({
      durationMode: true,
      durationSeconds: 30,
      multiplier: 60,
      domain: wide,
    }),
    205_000_000 / 30,
  );
});

test("resolveAnimationSpeed: multiplier mode returns the raw multiplier", () => {
  assert.equal(
    resolveAnimationSpeed({
      durationMode: false,
      durationSeconds: 30,
      multiplier: 1200,
      domain,
    }),
    1200,
  );
});

test("resolveAnimationSpeed: falls back to multiplier without a usable domain", () => {
  assert.equal(
    resolveAnimationSpeed({
      durationMode: true,
      durationSeconds: 30,
      multiplier: 60,
      domain: null,
    }),
    60,
  );
  // Zero-width domain cannot be fitted; fall back to the multiplier.
  assert.equal(
    resolveAnimationSpeed({
      durationMode: true,
      durationSeconds: 30,
      multiplier: 60,
      domain: { t0: 5, t1: 5 },
    }),
    60,
  );
});

test("resolveAnimationSpeed: clamps a duration below 1 second", () => {
  // durationSeconds is floored at 1, so a 100s span yields at most 100x.
  assert.equal(
    resolveAnimationSpeed({
      durationMode: true,
      durationSeconds: 0,
      multiplier: 60,
      domain,
    }),
    100,
  );
});

// A controller driven by a manual frame queue and clock so the RAF loop is
// deterministic in the test environment.
const makeHarness = () => {
  const ticks: number[] = [];
  let completeCount = 0;
  let nowMs = 0;
  const frames: Array<() => void> = [];
  const controller = new TimeAnimationController(
    (t) => ticks.push(t),
    (cb) => {
      frames.push(cb);
      return frames.length;
    },
    () => {},
    () => nowMs,
    () => {
      completeCount += 1;
    },
  );
  const runFrame = () => {
    const next = frames.shift();
    next?.();
  };
  const advanceClock = (ms: number) => {
    nowMs += ms;
  };
  const pendingFrames = () => frames.length;
  const completions = () => completeCount;
  return {
    controller,
    ticks,
    runFrame,
    advanceClock,
    pendingFrames,
    completions,
  };
};

test("controller resets to t0 on a new domain and stays inert until play", () => {
  const { controller, ticks } = makeHarness();
  controller.setDomain({ t0: 10, t1: 50 });
  controller.setConfig({ animationSpeed: 1, loop: true });
  assert.equal(controller.getTime(), 10);
  assert.equal(controller.isPlaying(), false);
  assert.deepEqual(ticks, []);
});

test("controller advances time across frames while playing", () => {
  const { controller, ticks, runFrame, advanceClock } = makeHarness();
  controller.setDomain({ t0: 0, t1: 100 });
  controller.setConfig({ animationSpeed: 10, loop: true });
  controller.play();

  // First frame establishes the baseline tick (delta 0, no movement).
  runFrame();
  // 1s of wall clock at 10x => +10 sim seconds.
  advanceClock(1000);
  runFrame();
  assert.equal(controller.getTime(), 10);
  // Another 0.5s => +5.
  advanceClock(500);
  runFrame();
  assert.equal(controller.getTime(), 15);
  assert.deepEqual(ticks, [10, 15]);
});

test("controller pause halts advancement", () => {
  const { controller, runFrame, advanceClock } = makeHarness();
  controller.setDomain({ t0: 0, t1: 100 });
  controller.setConfig({ animationSpeed: 10, loop: true });
  controller.play();
  runFrame();
  advanceClock(1000);
  controller.pause();
  const timeAtPause = controller.getTime();
  // No queued frames should run after pause; advancing the clock does nothing.
  advanceClock(5000);
  assert.equal(controller.getTime(), timeAtPause);
});

test("controller setDomain(null) stops playback", () => {
  const { controller } = makeHarness();
  controller.setDomain({ t0: 0, t1: 100 });
  controller.play();
  assert.equal(controller.isPlaying(), true);
  controller.setDomain(null);
  assert.equal(controller.isPlaying(), false);
  assert.equal(controller.getTime(), 0);
});

test("controller stops scheduling frames once it clamps at t1 (loop off)", () => {
  const { controller, runFrame, advanceClock, pendingFrames, completions } =
    makeHarness();
  controller.setDomain({ t0: 0, t1: 10 });
  controller.setConfig({ animationSpeed: 100, loop: false });
  controller.play();

  // Baseline frame, then a big step that clamps to t1 and completes.
  runFrame();
  advanceClock(1000);
  runFrame();
  assert.equal(controller.getTime(), 10);
  assert.equal(controller.isPlaying(), false);
  assert.equal(pendingFrames(), 0);
  assert.equal(completions(), 1);
});

test("controller keeps looping at the end when loop is on", () => {
  const { controller, runFrame, advanceClock, pendingFrames } = makeHarness();
  controller.setDomain({ t0: 0, t1: 10 });
  controller.setConfig({ animationSpeed: 100, loop: true });
  controller.play();

  runFrame();
  advanceClock(1000);
  runFrame();
  // Wrapped back to t0, still playing with a frame queued.
  assert.equal(controller.getTime(), 0);
  assert.equal(controller.isPlaying(), true);
  assert.equal(pendingFrames(), 1);
});

test("seek jumps the playhead and fires onTick", () => {
  const { controller, ticks } = makeHarness();
  controller.setDomain({ t0: 0, t1: 100 });
  controller.seek(42);
  assert.equal(controller.getTime(), 42);
  assert.deepEqual(ticks, [42]);
});

test("seek clamps into the domain", () => {
  const { controller } = makeHarness();
  controller.setDomain({ t0: 10, t1: 50 });
  controller.seek(-5);
  assert.equal(controller.getTime(), 10);
  controller.seek(999);
  assert.equal(controller.getTime(), 50);
});

test("seek is a no-op without a domain or for non-finite input", () => {
  const { controller, ticks } = makeHarness();
  controller.seek(42);
  assert.equal(controller.getTime(), 0);
  controller.setDomain({ t0: 0, t1: 100 });
  controller.seek(Number.NaN);
  assert.equal(controller.getTime(), 0);
  assert.deepEqual(ticks, []);
});

test("a play frame after seek advances from the sought time without jumping", () => {
  const { controller, runFrame, advanceClock } = makeHarness();
  controller.setDomain({ t0: 0, t1: 100 });
  controller.setConfig({ animationSpeed: 10, loop: true });
  controller.seek(40);
  controller.play();

  // Baseline frame (delta 0), then 1s at 10x => +10 from the sought 40.
  runFrame();
  advanceClock(1000);
  runFrame();
  assert.equal(controller.getTime(), 50);
});
