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

// Rationale guard for the temporal layers: absolute Unix-second epochs exceed
// float32 precision, so the layers feed the GPU time relative to t0. This
// confirms why that matters — absolute epochs are lossy in float32 while the
// relative values are exact.
test("epoch seconds lose float32 precision but relative-to-t0 values do not", () => {
  const toF32 = (value: number): number => Math.fround(value);
  const domain = computeTimeDomain([
    Date.parse("2026-06-15T08:00:00Z") / 1000,
    Date.parse("2026-06-15T19:00:00Z") / 1000,
  ]);
  assert.ok(domain);
  const ts = Date.parse("2026-06-15T09:00:00Z") / 1000;
  // Absolute epoch is not float32-exact (ULP ~128 s at this magnitude).
  assert.notEqual(toF32(ts), ts);
  // Relative to t0 (small value) round-trips exactly through float32.
  assert.equal(toF32(ts - domain.t0), ts - domain.t0);
});
