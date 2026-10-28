/**
 * Geometry decoder worker. Bundled by scripts/generate-geometry-worker.cjs into a string that the visual starts
 * from a Blob URL (Power BI visuals can't load worker files by URL).
 *
 * In:  { type: "init", wasm: Uint8Array }                       WKP Wasm bytes, sent once
 *      { type: "decode", id, encodings: Uint8Array, values }    encodings[i]: 0 = WKT, 1 = WKP
 * Out: { type: "decoded", id, batch: PackedGeometryBatch }      buffers transferred
 *      { type: "error", id, message }
 *
 * Rows the fast path can't decode are left empty in the batch; the main thread then parses them exactly as
 * before, so error reporting is unchanged.
 */
import { createWkp } from "@wkpjs/web";
import {
  PackedGeometryWriter,
  packGeoJson,
  packWkt,
  packedBatchBuffers,
} from "../geometryPacking";

type Wkp = Awaited<ReturnType<typeof createWkp>>;
type WorkerScope = {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

export const WKT_ENCODING = 0;
export const WKP_ENCODING = 1;

const scope = self as unknown as WorkerScope;
let wkpReady: Promise<{ wkp: Wkp; context: InstanceType<Wkp["Context"]> } | null> = Promise.resolve(null);

export async function decodeValues(encodings: Uint8Array, values: string[]) {
  const writer = new PackedGeometryWriter(values.length);
  const needsWkp = encodings.includes(WKP_ENCODING);
  const wkp = needsWkp ? await wkpReady : null;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (encodings[index] === WKT_ENCODING) {
      packWkt(writer, value);
    } else if (wkp) {
      let geometry = null;
      try {
        geometry = wkp.wkp.decode(wkp.context, value).geometry;
      } catch {
        geometry = null;
      }
      packGeoJson(writer, geometry);
    } else {
      writer.empty();
    }
  }
  return writer.finish();
}

scope.onmessage = (event: MessageEvent) => {
  const message = event.data;
  if (message?.type === "init") {
    wkpReady = createWkp({ wasmBinary: message.wasm })
      .then((wkp) => ({ wkp, context: new wkp.Context() }))
      .catch(() => null);
    return;
  }
  if (message?.type === "decode") {
    decodeValues(message.encodings, message.values).then(
      (batch) => scope.postMessage({ type: "decoded", id: message.id, batch }, packedBatchBuffers(batch)),
      (error) => scope.postMessage({ type: "error", id: message.id, message: String(error) }),
    );
  }
};
