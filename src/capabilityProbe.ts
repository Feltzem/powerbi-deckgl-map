/**
 * Capability probe (Phase 0 of the spatial engine plan).
 *
 * Answers, inside each Power BI host, the questions the Rust/Wasm worker and WebGPU work depend on:
 * can the visual start a Blob-URL worker, compile Wasm inside it, transfer buffers, get a WebGPU adapter,
 * and how many WebGL2 vertex attributes does the GPU allow. Turned on from Format pane > Diagnostics; results
 * render in an overlay with a "Copy results" button so they can be pasted into the spike log.
 */

export type ProbeStatus = "pass" | "fail" | "unavailable";

export interface ProbeResult {
  id: string;
  label: string;
  status: ProbeStatus;
  detail: string;
}

export interface ProbeEnvironment {
  hostEnv?: number;
  wasmBytes?: Uint8Array; // a real module (the inlined WKP Wasm) to compile inside the worker
  timeoutMs?: number;
}

const HOST_ENV_FLAGS: Array<[number, string]> = [
  [1 << 0, "Web"],
  [1 << 1, "PublishToWeb"],
  [1 << 2, "Desktop"],
  [1 << 3, "Embed"],
  [1 << 4, "ReportServer"],
  [1 << 5, "ExportReportHost"],
  [1 << 6, "Mobile"],
];

/** (module (func (export "add") (param i32 i32) (result i32) local.get 0 local.get 1 i32.add)) */
export const TINY_ADD_WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f, 0x03,
  0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00, 0x0a, 0x09, 0x01, 0x07, 0x00, 0x20,
  0x00, 0x20, 0x01, 0x6a, 0x0b,
]);

/** (module (func (result v128) v128.const i32x4 0 0 0 0)): validates only where Wasm SIMD is supported. */
export const SIMD_WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, 0x03, 0x02, 0x01,
  0x00, 0x0a, 0x16, 0x01, 0x14, 0x00, 0xfd, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0b,
]);

export function describeHostEnv(hostEnv: number | undefined): string {
  if (hostEnv === undefined || hostEnv === null) return "unknown";
  const names = HOST_ENV_FLAGS.filter(([flag]) => (hostEnv & flag) !== 0).map(([, name]) => name);
  return names.length ? names.join(" + ") : `unknown (${hostEnv})`;
}

// The worker gets its source from a Blob, so it has no imports. It answers one message: compile the Wasm it is
// sent, report what it can see, and echo a transferred buffer back.
const WORKER_SOURCE = `
self.onmessage = async (event) => {
  const { tiny, big, buffer } = event.data;
  const out = { ok: true };
  try {
    const { instance } = await WebAssembly.instantiate(tiny);
    out.add = instance.exports.add(2, 3);
  } catch (e) { out.tinyError = String(e && e.message || e); }
  if (big) {
    const t = performance.now();
    try { await WebAssembly.compile(big); out.bigMs = performance.now() - t; }
    catch (e) { out.bigError = String(e && e.message || e); }
  }
  out.offscreenCanvas = typeof OffscreenCanvas !== "undefined";
  out.gpu = typeof navigator !== "undefined" && !!navigator.gpu;
  out.bufferBytes = buffer ? buffer.byteLength : 0;
  self.postMessage(out, buffer ? [buffer] : []);
};
`;

function result(id: string, label: string, status: ProbeStatus, detail: string): ProbeResult {
  return { id, label, status, detail };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function probeMainThreadWasm(): Promise<ProbeResult[]> {
  if (typeof WebAssembly === "undefined") {
    return [result("wasm-main", "Inline Wasm (main thread)", "unavailable", "WebAssembly is not defined")];
  }
  const out: ProbeResult[] = [];
  try {
    const { instance } = await WebAssembly.instantiate(TINY_ADD_WASM);
    const sum = (instance.exports.add as (a: number, b: number) => number)(2, 3);
    out.push(result("wasm-main", "Inline Wasm (main thread)", sum === 5 ? "pass" : "fail", `add(2, 3) = ${sum}`));
  } catch (error) {
    out.push(result("wasm-main", "Inline Wasm (main thread)", "fail", errorText(error)));
  }
  const simd = WebAssembly.validate(SIMD_WASM);
  out.push(result("wasm-simd", "Wasm SIMD128", simd ? "pass" : "fail", simd ? "validates" : "module rejected"));
  return out;
}

async function probeWorker(env: ProbeEnvironment): Promise<ProbeResult[]> {
  if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL?.createObjectURL !== "function") {
    return [result("worker-blob", "Blob-URL worker", "unavailable", "Worker, Blob or URL.createObjectURL missing")];
  }
  let url: string | null = null;
  let worker: Worker | null = null;
  try {
    url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
    worker = new Worker(url);
    const buffer = new ArrayBuffer(1 << 20);
    const reply = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no reply within ${env.timeoutMs ?? 5000} ms`)), env.timeoutMs ?? 5000);
      worker!.onmessage = (event) => {
        clearTimeout(timer);
        resolve(event.data);
      };
      worker!.onerror = (event) => {
        clearTimeout(timer);
        reject(new Error(event.message || "worker error (likely blocked by the host's content security policy)"));
      };
      worker!.postMessage({ tiny: TINY_ADD_WASM, big: env.wasmBytes, buffer }, [buffer]);
    });
    const out = [result("worker-blob", "Blob-URL worker", "pass", "started and replied")];
    out.push(
      reply.tinyError
        ? result("wasm-worker", "Inline Wasm in worker", "fail", String(reply.tinyError))
        : result("wasm-worker", "Inline Wasm in worker", reply.add === 5 ? "pass" : "fail", `add(2, 3) = ${reply.add}`),
    );
    if (env.wasmBytes) {
      const kb = Math.round(env.wasmBytes.byteLength / 1024);
      out.push(
        reply.bigError
          ? result("wasm-worker-real", `Compile ${kb} KB Wasm in worker`, "fail", String(reply.bigError))
          : result("wasm-worker-real", `Compile ${kb} KB Wasm in worker`, "pass", `${Number(reply.bigMs).toFixed(0)} ms`),
      );
    }
    out.push(
      result(
        "transfer",
        "Transferable buffers",
        reply.bufferBytes === 1 << 20 && buffer.byteLength === 0 ? "pass" : "fail",
        `worker received ${reply.bufferBytes} bytes; sender buffer now ${buffer.byteLength} bytes`,
      ),
    );
    out.push(
      result("offscreen", "OffscreenCanvas in worker", reply.offscreenCanvas ? "pass" : "unavailable", ""),
      result("gpu-worker", "navigator.gpu in worker", reply.gpu ? "pass" : "unavailable", ""),
    );
    return out;
  } catch (error) {
    return [result("worker-blob", "Blob-URL worker", "fail", errorText(error))];
  } finally {
    worker?.terminate();
    if (url) URL.revokeObjectURL(url);
  }
}

async function probeWebGpu(): Promise<ProbeResult> {
  const gpu = (globalThis.navigator as unknown as { gpu?: { requestAdapter: () => Promise<any> } })?.gpu;
  if (!gpu) return result("webgpu", "WebGPU adapter", "unavailable", "navigator.gpu is not defined");
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return result("webgpu", "WebGPU adapter", "fail", "requestAdapter() returned null");
    const info = adapter.info ?? {};
    const device = await adapter.requestDevice();
    device.destroy?.();
    const name = [info.vendor, info.architecture, info.description].filter(Boolean).join(" / ") || "adapter";
    return result("webgpu", "WebGPU adapter", "pass", `${name}; device created`);
  } catch (error) {
    return result("webgpu", "WebGPU adapter", "fail", errorText(error));
  }
}

function probeWebGl2(): ProbeResult {
  if (typeof document === "undefined") return result("webgl2", "WebGL2 limits", "unavailable", "no document");
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2");
  if (!gl) return result("webgl2", "WebGL2 limits", "fail", "getContext('webgl2') returned null");
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const attribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
  const texture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const floatLinear = !!gl.getExtension("OES_texture_float_linear");
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return result(
    "webgl2",
    "WebGL2 limits",
    "pass",
    `MAX_VERTEX_ATTRIBS ${attribs}, MAX_TEXTURE_SIZE ${texture}, float linear ${floatLinear ? "yes" : "no"}, ${renderer}`,
  );
}

function probeIsolation(): ProbeResult {
  const sab = typeof SharedArrayBuffer !== "undefined";
  const isolated = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  return result(
    "threads",
    "Wasm threads (SharedArrayBuffer)",
    sab && isolated ? "pass" : "unavailable",
    `SharedArrayBuffer ${sab ? "defined" : "missing"}, crossOriginIsolated ${isolated}`,
  );
}

export async function runCapabilityProbe(env: ProbeEnvironment = {}): Promise<ProbeResult[]> {
  const nav = globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined;
  const results: ProbeResult[] = [
    result(
      "host",
      "Host",
      "pass",
      `${describeHostEnv(env.hostEnv)}; ${nav?.userAgent ?? "no navigator"}; ` +
        `${nav?.hardwareConcurrency ?? "?"} cores, ${nav?.deviceMemory ?? "?"} GB`,
    ),
  ];
  results.push(...(await probeMainThreadWasm()));
  results.push(...(await probeWorker(env)));
  results.push(probeIsolation());
  results.push(await probeWebGpu());
  results.push(probeWebGl2());
  return results;
}

/** Plain-text table for pasting into the spike log. */
export function formatProbeResults(results: ProbeResult[], when: Date = new Date()): string {
  const lines = [`powerbi-deckgl-map capability probe, ${when.toISOString()}`];
  for (const r of results) {
    lines.push(`${r.status.toUpperCase().padEnd(11)} ${r.label}${r.detail ? `: ${r.detail}` : ""}`);
  }
  return lines.join("\n");
}

/** Render results into `container` (replacing its content). */
export function renderProbePanel(container: HTMLElement, results: ProbeResult[] | null, onClose: () => void): void {
  container.replaceChildren();
  container.className = "deckgl-capability-probe";
  const title = document.createElement("div");
  title.className = "deckgl-capability-probe__title";
  title.textContent = results ? "Capability probe" : "Capability probe: running…";
  container.appendChild(title);
  if (results) {
    const list = document.createElement("table");
    for (const r of results) {
      const row = list.insertRow();
      const status = row.insertCell();
      status.textContent = r.status;
      status.className = `deckgl-capability-probe__status deckgl-capability-probe__status--${r.status}`;
      row.insertCell().textContent = r.label;
      row.insertCell().textContent = r.detail;
    }
    container.appendChild(list);
    const copy = document.createElement("button");
    copy.textContent = "Copy results";
    copy.onclick = () => {
      const text = formatProbeResults(results);
      navigator.clipboard?.writeText(text).then(
        () => (copy.textContent = "Copied"),
        () => (copy.textContent = "Clipboard blocked: select the table instead"),
      );
    };
    container.appendChild(copy);
  }
  const close = document.createElement("button");
  close.textContent = "Close";
  close.onclick = onClose;
  container.appendChild(close);
}
