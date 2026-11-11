import test from "node:test";
import assert from "node:assert/strict";

import { parseColorInput } from "../src/powerbiUtils";

test("parseColorInput recognizes direct hex and css colors", () => {
  assert.deepEqual(parseColorInput("#336699").rgbaColor, [51, 102, 153, 255]);
  assert.deepEqual(parseColorInput("#33669980").rgbaColor, [
    51,
    102,
    153,
    128,
  ]);
  assert.deepEqual(parseColorInput("rgba(10, 20, 30, 0.5)").rgbaColor, [
    10,
    20,
    30,
    128,
  ]);
});

test("parseColorInput separates numeric and categorical values", () => {
  assert.equal(parseColorInput("12.5").numericValue, 12.5);
  assert.equal(parseColorInput(42).numericValue, 42);
  assert.equal(parseColorInput("12abc").categoricalValue, "12abc");
  assert.equal(parseColorInput(" sealed ").categoricalValue, "sealed");
});

test("parseColorInput treats empty and null values as missing", () => {
  assert.deepEqual(parseColorInput(null), {
    rgbaColor: null,
    numericValue: null,
    categoricalValue: null,
  });
  assert.deepEqual(parseColorInput("   "), {
    rgbaColor: null,
    numericValue: null,
    categoricalValue: null,
  });
});

test("parseColorInput returns the same result for repeated and evicted strings", () => {
  const inputs = ["#336699", "rgba(10, 20, 30, 0.5)", " 12.5 ", "sealed", "'metalled'", ""];
  const first = inputs.map((input) => structuredClone(parseColorInput(input)));

  for (let index = 0; index < 100_500; index += 1) {
    parseColorInput(`category-${index}`);
  }

  assert.deepEqual(inputs.map((input) => parseColorInput(input)), first);
  assert.deepEqual(inputs.map((input) => parseColorInput(input)), first);
});
