import test from "node:test";
import assert from "node:assert/strict";

import { isWithinTrailingWindow, timestampToHeight } from "../src/timeHeight";

const domain = { t0: 0, t1: 100 };

test("timestampToHeight is linear across the domain", () => {
  assert.equal(timestampToHeight(0, domain, 1000), 0);
  assert.equal(timestampToHeight(50, domain, 1000), 500);
  assert.equal(timestampToHeight(100, domain, 1000), 1000);
});

test("timestampToHeight clamps outside the domain", () => {
  assert.equal(timestampToHeight(-10, domain, 1000), 0);
  assert.equal(timestampToHeight(200, domain, 1000), 1000);
});

test("timestampToHeight returns 0 for null/non-finite or empty span", () => {
  assert.equal(timestampToHeight(null, domain, 1000), 0);
  assert.equal(timestampToHeight(Number.NaN, domain, 1000), 0);
  assert.equal(timestampToHeight(50, { t0: 5, t1: 5 }, 1000), 0);
});

test("isWithinTrailingWindow includes timestamps in [time - trail, time]", () => {
  assert.equal(isWithinTrailingWindow(40, 50, 20), true);
  assert.equal(isWithinTrailingWindow(50, 50, 20), true);
  assert.equal(isWithinTrailingWindow(30, 50, 20), true);
});

test("isWithinTrailingWindow excludes timestamps outside the window", () => {
  assert.equal(isWithinTrailingWindow(29, 50, 20), false);
  assert.equal(isWithinTrailingWindow(51, 50, 20), false);
});

test("isWithinTrailingWindow keeps untimed rows visible", () => {
  assert.equal(isWithinTrailingWindow(null, 50, 20), true);
  assert.equal(isWithinTrailingWindow(Number.NaN, 50, 20), true);
});
