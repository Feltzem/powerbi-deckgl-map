declare module "@luma.gl/core/shadertypes/textures/texture-formats" {
  export type TextureFormatColor = string;
  export type TextureFormatDepthStencil = string;
}

declare module "@wkpjs/web" {
  import type { Geometry } from "geojson";

  interface WkpContext {}

  interface WkpModule {
    Context: new () => WkpContext;
    decode: (
      context: WkpContext,
      encoded: string,
    ) => {
      geometry: Geometry;
    };
    encode: (
      context: WkpContext,
      geometry: Geometry,
      precision?: number,
    ) => string;
  }

  export const createWkp: (options: {
    wasmBinary: Uint8Array;
  }) => Promise<WkpModule>;
}
