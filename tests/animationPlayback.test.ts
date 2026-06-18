import test from "node:test";
import assert from "node:assert/strict";

import { syncCompletedAnimationPlayback } from "../src/animationPlayback";

test("syncCompletedAnimationPlayback persists play false when playback completes", () => {
  const animation = { play: { value: true } };
  const changes: unknown[] = [];
  const host = {
    persistProperties(change: unknown) {
      changes.push(change);
    },
  };

  assert.equal(syncCompletedAnimationPlayback(animation, host), true);
  assert.equal(animation.play.value, false);
  assert.deepEqual(changes, [
    {
      merge: [
        {
          objectName: "animationProps",
          selector: null,
          properties: { play: false },
        },
      ],
    },
  ]);
});

test("syncCompletedAnimationPlayback is inert when already paused", () => {
  const animation = { play: { value: false } };
  const changes: unknown[] = [];
  const host = {
    persistProperties(change: unknown) {
      changes.push(change);
    },
  };

  assert.equal(syncCompletedAnimationPlayback(animation, host), false);
  assert.deepEqual(changes, []);
});
