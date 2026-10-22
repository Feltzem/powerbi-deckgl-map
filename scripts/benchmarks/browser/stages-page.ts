// Browser entry for the per-stage benchmarks. Loaded on its own page so its
// copy of deck.gl never shares a page with the packaged visual.

import { decodeAsGeometry } from "../../../src/encoding";
import { runScenarioStages } from "../stages";
import { buildScenario, getWkpCodec } from "./scenarios";

const gc = (globalThis as any).gc as (() => void) | undefined;

// src/encoding.ts initialises its WKP module asynchronously on import, and the
// mapper drops WKP rows until it is ready.
const waitForVisualWkp = async (sample: string) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      decodeAsGeometry(sample);
      return;
    } catch (error) {
      if (!String(error).includes("still initializing")) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error("WKP module in src/encoding.ts never initialised");
};

(window as any).benchStages = {
  async run(key: string) {
    const codec = await getWkpCodec();
    await waitForVisualWkp(codec.encode({ type: "Point", coordinates: [175, -37] }, 6));
    const scenario = await buildScenario(key);
    return runScenarioStages(scenario, { decodeWkp: codec.decode, gc });
  },
};
(window as any).benchReady = true;
