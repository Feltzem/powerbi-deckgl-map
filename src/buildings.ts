"use strict";

export const BUILDINGS_SOURCE_ID = "openfreemap-buildings";
export const BUILDINGS_LAYER_ID = "3d-buildings";
export const DEFAULT_3D_BUILDINGS_MIN_ZOOM = 15;
export const MAX_3D_BUILDINGS_ZOOM = 24;
export const OPENFREEMAP_TILES_URL = "https://tiles.openfreemap.org/planet";

type Expression = unknown[];

export interface MapStyleLayerLike {
  id?: string;
  type?: string;
  layout?: Record<string, unknown>;
}

export interface BuildingsSourceSpecification {
  type: "vector";
  url: string;
}

export interface BuildingsLayerSpecification {
  id: typeof BUILDINGS_LAYER_ID;
  source: typeof BUILDINGS_SOURCE_ID;
  "source-layer": "building";
  type: "fill-extrusion";
  minzoom: number;
  maxzoom: typeof MAX_3D_BUILDINGS_ZOOM;
  filter: Expression;
  paint: {
    "fill-extrusion-color": Expression;
    "fill-extrusion-height": Expression;
    "fill-extrusion-base": Expression;
    "fill-extrusion-opacity": number;
    "fill-extrusion-vertical-gradient": boolean;
  };
}

export const clamp3DBuildingsMinZoom = (zoom: unknown): number => {
  const numericZoom = typeof zoom === "number" && isFinite(zoom) ? zoom : 15;
  return Math.min(
    MAX_3D_BUILDINGS_ZOOM,
    Math.max(0, numericZoom),
  );
};

export const getFirstSymbolLayerId = (
  layers: readonly MapStyleLayerLike[] = [],
): string | undefined => {
  const labelLayer = layers.find(
    (layer) => layer.type === "symbol" && !!layer.layout?.["text-field"],
  );

  return labelLayer?.id;
};

export const create3DBuildingsSource = (): BuildingsSourceSpecification => ({
  type: "vector",
  url: OPENFREEMAP_TILES_URL,
});

export const create3DBuildingsLayer = (
  minZoom = DEFAULT_3D_BUILDINGS_MIN_ZOOM,
): BuildingsLayerSpecification => {
  const buildingHeight: Expression = [
    "to-number",
    ["get", "render_height"],
    0,
  ];
  const buildingBase: Expression = [
    "to-number",
    ["get", "render_min_height"],
    0,
  ];

  return {
    id: BUILDINGS_LAYER_ID,
    source: BUILDINGS_SOURCE_ID,
    "source-layer": "building",
    type: "fill-extrusion",
    minzoom: clamp3DBuildingsMinZoom(minZoom),
    maxzoom: MAX_3D_BUILDINGS_ZOOM,
    filter: ["!=", ["get", "hide_3d"], true],
    paint: {
      "fill-extrusion-color": [
        "interpolate",
        ["linear"],
        buildingHeight,
        0,
        "#d4d8dd",
        200,
        "#8baed9",
        400,
        "#c7e1f6",
      ],
      "fill-extrusion-height": buildingHeight,
      "fill-extrusion-base": buildingBase,
      "fill-extrusion-opacity": 0.78,
      "fill-extrusion-vertical-gradient": true,
    },
  };
};
