import test from "node:test";
import assert from "node:assert/strict";

import { computeTimeDomain, toUnixSeconds } from "../src/time";

test("toUnixSeconds converts a Date to seconds", () => {
  const date = new Date("2020-01-01T00:00:00Z");
  assert.equal(toUnixSeconds(date), date.getTime() / 1000);
});

test("toUnixSeconds treats numbers as already-seconds", () => {
  assert.equal(toUnixSeconds(1577836800), 1577836800);
});

test("toUnixSeconds parses ISO strings", () => {
  assert.equal(
    toUnixSeconds("2020-01-01T00:00:00Z"),
    Date.parse("2020-01-01T00:00:00Z") / 1000,
  );
});

test("toUnixSeconds returns null for blank/unparseable values", () => {
  assert.equal(toUnixSeconds(null), null);
  assert.equal(toUnixSeconds(undefined), null);
  assert.equal(toUnixSeconds(""), null);
  assert.equal(toUnixSeconds("not a date"), null);
});

test("computeTimeDomain spans min and max, ignoring nulls", () => {
  assert.deepEqual(computeTimeDomain([100, null, 50, 200, null]), {
    t0: 50,
    t1: 200,
  });
});

test("computeTimeDomain nudges t1 when all timestamps collapse", () => {
  assert.deepEqual(computeTimeDomain([100, 100, 100]), { t0: 100, t1: 101 });
});

test("computeTimeDomain returns null when no finite timestamps exist", () => {
  assert.equal(computeTimeDomain([null, null]), null);
  assert.equal(computeTimeDomain([]), null);
  assert.equal(computeTimeDomain([Number.NaN, Number.POSITIVE_INFINITY]), null);
});
