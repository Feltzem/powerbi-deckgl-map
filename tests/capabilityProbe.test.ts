import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  describeHostEnv,
  formatProbeResults,
  runCapabilityProbe,
  SIMD_WASM,
  TINY_ADD_WASM,
} from "../src/capabilityProbe";

test("host environment flags decode to readable names", () => {
  assert.equal(describeHostEnv(1 << 2), "Desktop");
  assert.equal(describeHostEnv((1 << 0) | (1 << 3)), "Web + Embed");
  assert.equal(describeHostEnv(1 << 4), "ReportServer");
  assert.equal(describeHostEnv(undefined), "unknown");
  assert.equal(describeHostEnv(0), "unknown (0)");
});

test("embedded probe modules are valid Wasm", async () => {
  assert.ok(WebAssembly.validate(TINY_ADD_WASM));
  assert.ok(WebAssembly.validate(SIMD_WASM));
  const { instance } = await WebAssembly.instantiate(TINY_ADD_WASM);
  assert.equal((instance.exports.add as (a: number, b: number) => number)(2, 3), 5);
});

test("probe reports missing browser features as unavailable, not failures", async () => {
  // Node has WebAssembly but no Worker, document or navigator.gpu.
  const results = await runCapabilityProbe({ hostEnv: 1 << 2 });
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  assert.match(byId.host.detail, /^Desktop;/);
  assert.equal(byId["wasm-main"].status, "pass");
  assert.equal(byId["wasm-simd"].status, "pass");
  assert.equal(byId["worker-blob"].status, "unavailable");
  assert.equal(byId.webgpu.status, "unavailable");
  assert.equal(byId.webgl2.status, "unavailable");
  assert.ok(results.every((r) => r.status !== "fail"));
});

test("results format as a pasteable text log", () => {
  const text = formatProbeResults(
    [
      { id: "a", label: "Blob-URL worker", status: "pass", detail: "started and replied" },
      { id: "b", label: "WebGPU adapter", status: "unavailable", detail: "" },
    ],
    new Date("2026-10-24T08:00:00Z"),
  );
  assert.equal(
    text,
    [
      "powerbi-deckgl-map capability probe, 2026-10-24T08:00:00.000Z",
      "PASS        Blob-URL worker: started and replied",
      "UNAVAILABLE WebGPU adapter",
    ].join("\n"),
  );
});

test("diagnostics toggle is declared in capabilities", () => {
  const capabilities = JSON.parse(readFileSync(new URL("../capabilities.json", import.meta.url), "utf8"));
  assert.deepEqual(capabilities.objects.diagnosticsProps.properties.showCapabilityProbe.type, { bool: true });
});
