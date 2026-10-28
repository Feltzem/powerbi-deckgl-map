import { GEOMETRY_WORKER_SOURCE } from "./geometryWorkerSource";
import { PackedGeometryBatch } from "./geometryPacking";

/**
 * A small pool of geometry decoder workers started from a Blob URL. Values are split into contiguous chunks,
 * one per worker, and each chunk comes back as a packed batch with its start offset.
 *
 * Any failure (worker can't start, errors, or doesn't answer in time) rejects the decode and disables the pool,
 * so the visual falls back to parsing on the main thread as it did before.
 */
export interface DecodedChunk {
  start: number;
  batch: PackedGeometryBatch;
}

interface PendingRequest {
  resolve: (batch: PackedGeometryBatch) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface GeometryWorkerPoolOptions {
  size: number;
  wasm: Uint8Array;
  /** Per-request timeout. A hung worker disables the pool instead of stalling the visual. */
  timeoutMs?: number;
  source?: string;
  createWorker?: (url: string) => Worker;
}

export const defaultPoolSize = (): number => {
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(6, cores - 1));
};

export class GeometryWorkerPool {
  private workers: Worker[] = [];
  private pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private url: string | null = null;
  private disabled = false;
  private readonly timeoutMs: number;

  constructor(private readonly options: GeometryWorkerPoolOptions) {
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  /** Whether this environment can run the pool at all. */
  static isSupported(): boolean {
    return (
      typeof Worker !== "undefined" &&
      typeof Blob !== "undefined" &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function"
    );
  }

  get available(): boolean {
    return !this.disabled;
  }

  private start() {
    if (this.workers.length > 0) return;
    const source = this.options.source ?? GEOMETRY_WORKER_SOURCE;
    this.url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const create = this.options.createWorker ?? ((url: string) => new Worker(url));
    for (let index = 0; index < Math.max(1, this.options.size); index += 1) {
      const worker = create(this.url);
      worker.onmessage = (event: MessageEvent) => this.handleMessage(event.data);
      worker.onerror = (event: ErrorEvent) => this.fail(new Error(`Geometry worker error: ${event.message ?? "unknown"}`));
      worker.postMessage({ type: "init", wasm: this.options.wasm.slice() });
      this.workers.push(worker);
    }
  }

  private handleMessage(message: { type: string; id: number; batch?: PackedGeometryBatch; message?: string }) {
    const request = this.pending.get(message?.id);
    if (!request) return;
    this.pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.type === "decoded" && message.batch) request.resolve(message.batch);
    else request.reject(new Error(message.message ?? "Geometry worker failed"));
  }

  private send(worker: Worker, encodings: Uint8Array, values: string[]): Promise<PackedGeometryBatch> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error("Geometry worker timed out")), this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      worker.postMessage({ type: "decode", id, encodings, values }, [encodings.buffer]);
    });
  }

  /** Decode values (encodings[i]: 0 = WKT, 1 = WKP) across the pool. Rejects if the pool is unusable. */
  async decode(encodings: Uint8Array, values: string[]): Promise<DecodedChunk[]> {
    if (this.disabled) throw new Error("Geometry worker pool is disabled");
    try {
      this.start();
    } catch (error) {
      this.fail(error as Error);
      throw error;
    }
    const chunkSize = Math.ceil(values.length / this.workers.length);
    const requests: Array<Promise<DecodedChunk>> = [];
    for (let index = 0, start = 0; start < values.length; index += 1, start += chunkSize) {
      const end = Math.min(values.length, start + chunkSize);
      requests.push(
        this.send(this.workers[index], encodings.slice(start, end), values.slice(start, end)).then((batch) => ({
          start,
          batch,
        })),
      );
    }
    return Promise.all(requests);
  }

  /** Reject everything in flight and stop using workers for the rest of the session. */
  private fail(error: Error) {
    this.disabled = true;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    this.terminate();
  }

  private terminate() {
    for (const worker of this.workers) {
      try {
        worker.terminate();
      } catch {
        // Already gone.
      }
    }
    this.workers = [];
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  destroy() {
    this.fail(new Error("Geometry worker pool destroyed"));
  }
}
