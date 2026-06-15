import test from "node:test";
import assert from "node:assert/strict";

import { advanceTime, TimeAnimationController } from "../src/timeAnimation";

const domain = { t0: 0, t1: 100 };

test("advanceTime moves forward by speed * delta", () => {
  assert.equal(
    advanceTime(0, 0.5, domain, { animationSpeed: 60, loop: true }),
    30,
  );
});

test("advanceTime wraps to t0 past t1 when looping", () => {
  assert.equal(
    advanceTime(99, 1, domain, { animationSpeed: 60, loop: true }),
    0,
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

// A controller driven by a manual frame queue and clock so the RAF loop is
// deterministic in the test environment.
const makeHarness = () => {
  const ticks: number[] = [];
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
  );
  const runFrame = () => {
    const next = frames.shift();
    next?.();
  };
  const advanceClock = (ms: number) => {
    nowMs += ms;
  };
  return { controller, ticks, runFrame, advanceClock };
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
