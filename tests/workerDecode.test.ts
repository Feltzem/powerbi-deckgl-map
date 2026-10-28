import test from "node:test";
import assert from "node:assert/strict";
import powerbi from "powerbi-visuals-api";

import {
  collectGeometryToDecode,
  createDatasetSnapshot,
  storeDecodedGeometry,
} from "../src/mapper";
import { GeometryWorkerPool } from "../src/geometryWorkerPool";
import { VisualFormattingSettingsModel } from "../src/settings";

(globalThis as unknown as { powerbi: unknown }).powerbi = {
  visuals: { ValidatorType: { Min: "Min", Max: "Max" } },
};

// The worker module wires itself to `self`; give it a stand-in so fake workers can run it in-process.
type Scope = { onmessage: ((event: { data: unknown }) => void) | null; postMessage: (message: unknown) => void };
const scope: Scope = { onmessage: null, postMessage: () => undefined };
(globalThis as unknown as { self: Scope }).self = scope;

const host = {
  displayWarningIcon: () => undefined,
  createSelectionIdBuilder: () => ({
    withCategory: (_c: unknown, index: number) => ({
      createSelectionId: () => ({ getKey: () => `selection-${index}` }),
    }),
  }),
} as unknown as powerbi.extensibility.visual.IVisualHost;

const column = (role: string, values: powerbi.PrimitiveValue[]): powerbi.DataViewValueColumn => ({
  source: { displayName: role, queryName: role, roles: { [role]: true } },
  values,
});

const rows: Array<[string, string | null, number | null, number | null]> = [
  ["path", "LINESTRING (175.1 -37.7, 175.2 -37.8)", null, null],
  ["scatter", "LINESTRING (1 2, 3 4)", -37.7, 175.2], // scatter rows never parse geometry
  ["polygon", "POLYGON ((175 -37, 175.1 -37, 175.1 -37.1, 175 -37))", null, null],
  ["path", "SRID=4326;LINESTRING (175 -37, 175.3 -37.3)", null, null], // fast path declines; mapper parses it
  ["path", "not wkt", null, null], // invalid: mapper reports the error as before
  ["", "MULTILINESTRING ((175 -37, 175.1 -37.1), (175.2 -37.2, 175.3 -37.3))", null, null], // inferred from geometry
  ["path", null, null, null],
];

function options(count = rows.length) {
  const take = rows.slice(0, count);
  const values = [
    column("layerType", take.map((r) => r[0])),
    column("wkt", take.map((r) => r[1])),
    column("point1Latitude", take.map((r) => r[2])),
    column("point1Longitude", take.map((r) => r[3])),
  ] as unknown as powerbi.DataViewValueColumns;
  values.grouped = () => [];
  return {
    dataViews: [
      {
        categorical: {
          categories: [{ source: { displayName: "id", queryName: "id", roles: { geometryId: true } }, values: take.map((_, i) => `g${i}`) }],
          values,
        },
        metadata: {},
      },
    ],
  } as unknown as powerbi.extensibility.visual.VisualUpdateOptions;
}

class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminated = false;
  constructor(private readonly behaviour: "ok" | "crash" | "hang" = "ok") {}
  postMessage(message: unknown) {
    if (this.behaviour === "hang") return;
    if (this.behaviour === "crash") {
      setTimeout(() => this.onerror?.({ message: "boom" }), 0);
      return;
    }
    scope.postMessage = (reply) => setTimeout(() => this.onmessage?.({ data: reply }), 0);
    scope.onmessage?.({ data: message });
  }
  terminate() {
    this.terminated = true;
  }
}

const poolWith = (behaviour: "ok" | "crash" | "hang", created: FakeWorker[] = [], timeoutMs = 1000) =>
  new GeometryWorkerPool({
    size: 3,
    wasm: new Uint8Array(4),
    timeoutMs,
    source: "",
    createWorker: () => {
      const worker = new FakeWorker(behaviour);
      created.push(worker);
      return worker as unknown as Worker;
    },
  });

const summary = (snapshot: ReturnType<typeof createDatasetSnapshot>) =>
  snapshot.layers.all.map((d) => ({ id: d.id, type: d.type, path: d.pathData, polygon: d.polygonData }));

test.before(async () => {
  (globalThis as unknown as { URL: typeof URL }).URL.createObjectURL ??= () => "blob:test";
  (globalThis as unknown as { URL: typeof URL }).URL.revokeObjectURL ??= () => undefined;
  await import("../src/workers/geometryDecoder.worker");
});

test("collector picks only uncached path/polygon geometry, WKT first", () => {
  const settings = new VisualFormattingSettingsModel();
  const request = collectGeometryToDecode(options(), settings, new Map(), null);
  assert.deepEqual(request.values, [rows[0][1], rows[2][1], rows[3][1], rows[4][1], rows[5][1]]);
  assert.deepEqual(Array.from(request.encodings), [0, 0, 0, 0, 0]);

  const cache = new Map();
  cache.set(request.keys[0], { type: "LineString", coordinates: [] });
  assert.equal(collectGeometryToDecode(options(), settings, cache, null).values.length, 4);
});

test("collector resumes after the rows an append already parsed", () => {
  const settings = new VisualFormattingSettingsModel();
  const previous = createDatasetSnapshot(options(3), settings, host, new Map(), "1");
  const request = collectGeometryToDecode(options(), settings, new Map(), previous);
  assert.deepEqual(request.values, [rows[3][1], rows[4][1], rows[5][1]]);
});

test("pre-decoded geometry gives the same snapshot as parsing on the main thread", async () => {
  const settings = new VisualFormattingSettingsModel();
  const cache = new Map();
  const request = collectGeometryToDecode(options(), settings, cache, null);
  const chunks = await poolWith("ok").decode(request.encodings, request.values);
  assert.equal(storeDecodedGeometry(cache, request.keys, chunks), 3); // SRID and invalid rows are left to the mapper
  const warnings: string[] = [];
  const warnHost = { ...host, displayWarningIcon: (title: string, detail: string) => warnings.push(`${title} ${detail}`) };
  const viaWorkers = createDatasetSnapshot(options(), settings, warnHost as typeof host, cache, "1");
  const expectedWarnings: string[] = [];
  const plainHost = { ...host, displayWarningIcon: (title: string, detail: string) => expectedWarnings.push(`${title} ${detail}`) };
  const plain = createDatasetSnapshot(options(), settings, plainHost as typeof host, new Map(), "1");
  assert.deepEqual(summary(viaWorkers), summary(plain));
  assert.equal(viaWorkers.layers.path.length, 3);
  assert.deepEqual(warnings, expectedWarnings);
  assert.match(warnings[0] ?? "", /invalid WKT/);
});

test("pool splits work across workers and keeps order", async () => {
  const created: FakeWorker[] = [];
  const pool = poolWith("ok", created);
  const values = Array.from({ length: 10 }, (_, i) => `POINT (${i} ${-i})`);
  const chunks = await pool.decode(new Uint8Array(10), values);
  assert.equal(created.length, 3);
  assert.deepEqual(chunks.map((c) => c.start), [0, 4, 8]);
  const cache = new Map();
  storeDecodedGeometry(cache, values, chunks);
  assert.deepEqual(cache.get("POINT (7 -7)"), { type: "Point", coordinates: [7, -7] });
  pool.destroy();
  assert.ok(created.every((w) => w.terminated));
});

test("a crashing or hung worker disables the pool so the visual falls back", async () => {
  const crashed = poolWith("crash");
  await assert.rejects(crashed.decode(new Uint8Array(2), ["POINT (1 2)", "POINT (3 4)"]), /boom/);
  assert.equal(crashed.available, false);
  await assert.rejects(crashed.decode(new Uint8Array(1), ["POINT (1 2)"]), /disabled/);

  const created: FakeWorker[] = [];
  const hung = poolWith("hang", created, 20);
  await assert.rejects(hung.decode(new Uint8Array(1), ["POINT (1 2)"]), /timed out/);
  assert.equal(hung.available, false);
  assert.ok(created.every((w) => w.terminated));
});

// ── GeometryDecodeQueue ─────────────────────────────────────────────────────
import { GeometryDecodeQueue, GeometryDecoder } from "../src/geometryDecodeQueue";

const requestOf = (values: string[]) => ({ keys: values, encodings: new Uint8Array(values.length), values });

class ControlledDecoder implements GeometryDecoder {
  available = true;
  calls: string[][] = [];
  private releases: Array<() => void> = [];
  fail = false;
  decode(_encodings: Uint8Array, values: string[]) {
    this.calls.push(values);
    return new Promise<never[]>((resolve, reject) => {
      this.releases.push(() => (this.fail ? reject(new Error("boom")) : resolve([])));
    });
  }
  release() {
    this.releases.shift()?.();
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test("queue parses small updates synchronously and skips without a decoder", () => {
  const decoder = new ControlledDecoder();
  const queue = new GeometryDecodeQueue(() => decoder, 3);
  assert.equal(queue.schedule(() => requestOf(["a", "b"]), () => undefined), null);
  assert.equal(new GeometryDecodeQueue(() => null, 1).schedule(() => requestOf(["a"]), () => undefined), null);
  decoder.available = false;
  assert.equal(queue.schedule(() => requestOf(["a", "b", "c"]), () => undefined), null);
});

test("an update arriving mid-decode waits, then collects only what is still missing", async () => {
  const decoder = new ControlledDecoder();
  const queue = new GeometryDecodeQueue(() => decoder, 1);
  const cached = new Set<string>();
  const collect = (values: string[]) => () => requestOf(values.filter((v) => !cached.has(v)));
  const store = (request: { values: string[] }) => request.values.forEach((v) => cached.add(v));

  const first = queue.schedule(collect(["a", "b"]), store)!;
  const second = queue.schedule(collect(["a", "b", "c"]), store)!;
  await tick();
  assert.deepEqual(decoder.calls, [["a", "b"]]); // the second waits for the first
  decoder.release();
  await first;
  await tick();
  assert.deepEqual(decoder.calls, [["a", "b"], ["c"]]); // re-collected after the first stored its results
  decoder.release();
  await second;
  assert.deepEqual([...cached], ["a", "b", "c"]);
});

test("a failed decode resolves so the caller falls back to the main thread", async () => {
  const decoder = new ControlledDecoder();
  decoder.fail = true;
  const queue = new GeometryDecodeQueue(() => decoder, 1);
  let stored = false;
  const pending = queue.schedule(() => requestOf(["a"]), () => (stored = true))!;
  await tick();
  decoder.release();
  await pending; // resolves, does not reject
  assert.equal(stored, false);
  decoder.fail = false;
  const next = queue.schedule(() => requestOf(["b"]), () => (stored = true))!;
  await tick();
  decoder.release();
  await next;
  assert.equal(stored, true);
});
