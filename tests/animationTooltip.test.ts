import test from "node:test";
import assert from "node:assert/strict";

import {
  formatAnimationTime,
  getAnimationTimeTooltipHtml,
} from "../src/animationTooltip";
import { AnimationContext } from "../src/timeAnimation";

const timeFormatOptions: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

test("formatAnimationTime renders a plausible epoch as a locale datetime", () => {
  const t = Date.parse("2024-03-01T12:00:00Z") / 1000;
  const expected = new Date(t * 1000).toLocaleString(
    undefined,
    timeFormatOptions,
  );
  assert.equal(formatAnimationTime(t), expected);
});

test("formatAnimationTime renders small arbitrary numerics as a raw number", () => {
  assert.equal(formatAnimationTime(42), "42");
});

test("formatAnimationTime renders out-of-range large numerics as raw numbers", () => {
  const expected = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 3,
  }).format(9e12);
  assert.equal(formatAnimationTime(9e12), expected);
});

test("formatAnimationTime returns empty string for non-finite input", () => {
  assert.equal(formatAnimationTime(Number.NaN), "");
  assert.equal(formatAnimationTime(Number.POSITIVE_INFINITY), "");
});

const makeContext = (time: number): AnimationContext => ({
  active: true,
  domain: { t0: 0, t1: 100 },
  time,
  trailLength: 0,
  maxHeight: 0,
});

test("getAnimationTimeTooltipHtml returns null when context is null", () => {
  assert.equal(getAnimationTimeTooltipHtml(null), null);
});

test("getAnimationTimeTooltipHtml returns null when context is inactive", () => {
  assert.equal(
    getAnimationTimeTooltipHtml({ ...makeContext(50), active: false }),
    null,
  );
});

test("getAnimationTimeTooltipHtml wraps the formatted time in a labelled banner", () => {
  const html = getAnimationTimeTooltipHtml(makeContext(42));
  assert.ok(html);
  assert.ok(html.includes("deckgl-animation-time-tooltip"));
  assert.ok(html.includes("<strong>Time</strong>"));
  assert.ok(html.includes("42"));
});
