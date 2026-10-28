import type { GeometryDecodeRequest } from "./mapper";
import type { DecodedChunk } from "./geometryWorkerPool";

/** The part of GeometryWorkerPool the queue uses. */
export interface GeometryDecoder {
  readonly available: boolean;
  decode(encodings: Uint8Array, values: string[]): Promise<DecodedChunk[]>;
}

/**
 * Runs worker decodes one at a time. If a decode is still running when the next data update arrives, the new
 * one waits and then collects again, because most of its geometry is usually in the batch already in flight.
 * Promises from `schedule` never reject: on any failure the geometry is simply left for the main thread.
 */
export class GeometryDecodeQueue {
  private chain: Promise<void> = Promise.resolve();
  private busy = false;

  constructor(
    private readonly getDecoder: () => GeometryDecoder | null,
    private readonly minValues: number,
  ) {}

  /**
   * `collect` lists uncached geometry for the update; `store` puts decoded results in the cache. Returns null
   * when there is too little to decode or no decoder, so the caller parses synchronously instead.
   */
  schedule(
    collect: () => GeometryDecodeRequest,
    store: (request: GeometryDecodeRequest, chunks: DecodedChunk[]) => void,
  ): Promise<void> | null {
    const initial = collect();
    if (initial.values.length < this.minValues) {
      return null;
    }
    const decoder = this.getDecoder();
    if (!decoder?.available) {
      return null;
    }
    const waitForEarlier = this.busy;
    const job = this.chain.then(async () => {
      const request = waitForEarlier ? collect() : initial;
      if (request.values.length === 0 || !decoder.available) {
        return;
      }
      store(request, await decoder.decode(request.encodings, request.values));
    });
    const settled: Promise<void> = job
      .catch(() => undefined)
      .finally(() => {
        if (this.chain === settled) {
          this.busy = false;
        }
      });
    this.busy = true;
    this.chain = settled;
    return settled;
  }
}
