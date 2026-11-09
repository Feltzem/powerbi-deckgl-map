// Scenario lookup shared by both browser pages. Hamilton CSVs are fetched from
// the local harness server; synthetic tables are generated in the page.

import { createWkp } from "@wkpjs/web";
import { WKP_CORE_WASM_BASE64 } from "../../../src/wkpWasmBase64";
import {
  buildHamiltonScenario,
  buildSyntheticScenario,
  buildUpdateOptions,
  csvToTable,
  HAMILTON_SCENARIOS,
  HAMILTON_TABLES,
  ObjectValues,
  ScenarioDataView,
  SyntheticSpec,
  syntheticScenarioId,
  syntheticSpecs,
  TableColumns,
  tileHamiltonRoads,
  WkpEncoder,
} from "../datasets";

export interface WkpCodec {
  encode: WkpEncoder;
  decode: (encoded: string) => any;
}

let codecPromise: Promise<WkpCodec> | null = null;

export const getWkpCodec = (): Promise<WkpCodec> => {
  codecPromise ??= (async () => {
    const binary = atob(WKP_CORE_WASM_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const wkp = await createWkp({ wasmBinary: bytes });
    const context = new wkp.Context();
    return {
      encode: (geometry, precision) => wkp.encode(context, geometry as any, precision),
      decode: (encoded) => wkp.decode(context, encoded).geometry,
    };
  })();
  return codecPromise;
};

let tablesPromise: Promise<Record<string, TableColumns>> | null = null;

export const getHamiltonTables = (): Promise<Record<string, TableColumns>> => {
  tablesPromise ??= (async () => {
    const entries = await Promise.all(
      HAMILTON_TABLES.map(async (name) => {
        const response = await fetch(`/samples/hamilton/${name}.csv`);
        return [name, csvToTable(await response.text())] as const;
      }),
    );
    return Object.fromEntries(entries);
  })();
  return tablesPromise;
};

export const EXTRA_SYNTHETIC_SPECS: SyntheticSpec[] = [
  { kind: "path", rows: 100_000, geometry: "wkp", color: "categorical", timestamps: true },
  { kind: "scatter", rows: 500_000, color: "categorical", timestamps: true },
];

const syntheticById = (id: string): SyntheticSpec | undefined =>
  [...syntheticSpecs(), ...EXTRA_SYNTHETIC_SPECS].find(
    (spec) => syntheticScenarioId(spec) === id,
  );

const ROAD_BINDINGS = {
  geometryId: "geometry_id",
  layerType: "layer_type",
  wkp: "wkp",
  pathWidth: "path_width_m",
  pathColor: "road_surface",
  tooltipHtml: "tooltip_html",
};

// Scenario keys: "hamilton:<id>", "synthetic:<id>", or "tiled:roads-x<copies>".
export const buildScenario = async (
  key: string,
  extraObjects: ObjectValues = {},
): Promise<ScenarioDataView> => {
  const [kind, id] = key.split(":");
  const mergeObjects = (objects: ObjectValues): ObjectValues => {
    const merged: ObjectValues = { ...objects };
    for (const [name, values] of Object.entries(extraObjects)) {
      merged[name] = { ...(merged[name] ?? {}), ...values };
    }
    return merged;
  };

  if (kind === "hamilton") {
    const spec = HAMILTON_SCENARIOS.find((candidate) => candidate.id === id);
    if (!spec) {
      throw new Error(`Unknown Hamilton scenario ${id}`);
    }
    return buildHamiltonScenario(
      { ...spec, objects: mergeObjects(spec.objects) },
      await getHamiltonTables(),
    );
  }

  if (kind === "synthetic") {
    const spec = syntheticById(id);
    if (!spec) {
      throw new Error(`Unknown synthetic scenario ${id}`);
    }
    const codec = spec.geometry === "wkp" ? await getWkpCodec() : null;
    return buildSyntheticScenario(spec, codec?.encode, extraObjects);
  }

  if (kind === "tiled") {
    const copies = Number(/^roads-x(\d+)$/.exec(id)?.[1]);
    if (!Number.isFinite(copies) || copies < 1) {
      throw new Error(`Unknown tiled scenario ${id}`);
    }
    const codec = await getWkpCodec();
    const tables = await getHamiltonTables();
    const table = tileHamiltonRoads(tables.hamilton_road_path, copies, codec.decode, codec.encode);
    return {
      id: `tiled-roads-x${copies}`,
      description: `Hamilton road network repeated ${copies} times (${table.rowCount.toLocaleString("en-NZ")} WKP paths with real shapes)`,
      rowCount: table.rowCount,
      options: buildUpdateOptions(
        table,
        ROAD_BINDINGS,
        mergeObjects({ mapProps: { baseMap: "blank", flyTo: true, flyToDuration: 0 } }),
      ),
    };
  }

  throw new Error(`Unknown scenario key ${key}`);
};
