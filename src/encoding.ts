import { createWkp } from '@wkpjs/web';
import { WKP_CORE_WASM_BASE64 } from './wkpWasmBase64';
import { Geometry } from 'geojson';

type WkpModule = Awaited<ReturnType<typeof createWkp>>;
type WkpContext = InstanceType<WkpModule["Context"]>;

let wkp: WkpModule | null = null;
let ctx: WkpContext | null = null;
let initError: Error | null = null;

function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

(async () => {
    try {
        const wasmBinary = base64ToUint8Array(WKP_CORE_WASM_BASE64);
        wkp = await createWkp({ wasmBinary });
        ctx = new wkp.Context();
    } catch (error) {
        initError = error as Error;
    }
})();

export function decodeAsGeometry(encoded: string): Geometry {
    if (initError) {
        throw initError;
    }
    if (!wkp || !ctx) {
        throw new Error("WKP is still initializing. Try again after visual startup completes.");
    }
    return wkp.decode(ctx, encoded).geometry;
}
