import test from "node:test";
import assert from "node:assert/strict";

import { opacityPercentToAlpha } from "../src/col";
import { VisualFormattingSettingsModel } from "../src/settings";

(
  globalThis as unknown as {
    powerbi: { visuals: { ValidatorType: { Min: string; Max: string } } };
  }
).powerbi = {
  visuals: {
    ValidatorType: {
      Min: "Min",
      Max: "Max",
    },
  },
};

test("opacityPercentToAlpha maps 0-100% onto the 0-255 alpha channel", () => {
  assert.equal(opacityPercentToAlpha(0), 0);
  assert.equal(opacityPercentToAlpha(50), 128);
  assert.equal(opacityPercentToAlpha(100), 255);
  assert.equal(opacityPercentToAlpha(255), 255);
  assert.equal(opacityPercentToAlpha(-5), 0);
  assert.equal(opacityPercentToAlpha(Number.NaN), 255);
});

test("every opacity setting is a 0-100% slider", () => {
  const settings = new VisualFormattingSettingsModel();
  const visit = (value: unknown, path: string, seen: Set<unknown>): void => {
    if (!value || typeof value !== "object" || seen.has(value)) {
      return;
    }
    seen.add(value);
    const slice = value as {
      name?: unknown;
      value?: unknown;
      options?: { maxValue?: { value?: unknown } };
    };
    if (
      typeof slice.name === "string" &&
      /opacity/i.test(slice.name) &&
      typeof slice.value === "number"
    ) {
      assert.equal(slice.options?.maxValue?.value, 100, `${path} max`);
      assert.ok(slice.value >= 0 && slice.value <= 100, `${path} default`);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, `${path}.${key}`, seen);
    }
  };
  visit(settings, "settings", new Set());
});

test("default fill and line opacity keep the previous look (about 39%)", () => {
  const settings = new VisualFormattingSettingsModel();
  assert.equal(settings.scatter.fill.defaultFillOpacity.value, 39);
  assert.equal(settings.scatter.line.color.defaultLineOpacity.value, 39);
  assert.equal(opacityPercentToAlpha(39), 99);
});
