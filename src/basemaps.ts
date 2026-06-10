"use strict";

export const CARTO_RASTER_BASEMAP_IDS = [
  "light_all",
  "dark_all",
  "light_nolabels",
  "light_only_labels",
  "dark_nolabels",
  "dark_only_labels",
  "rastertiles/voyager",
  "rastertiles/voyager_nolabels",
  "rastertiles/voyager_only_labels",
  "rastertiles/voyager_labels_under",
] as const;

export const WEB_APP_BASEMAP_IDS = [
  "positron",
  "positron_no_labels",
  "dark_matter",
  "dark_matter_no_labels",
  "blank",
] as const;

export const DEFAULT_BASEMAP_ID = "positron";

export type CartoRasterBasemapId = (typeof CARTO_RASTER_BASEMAP_IDS)[number];
export type WebAppBasemapId = (typeof WEB_APP_BASEMAP_IDS)[number];
export type BasemapId = CartoRasterBasemapId | WebAppBasemapId;
export type BasemapKind = "carto-raster" | "blank";

export interface BasemapOption {
  value: BasemapId;
  displayName: string;
}

export interface BasemapDefinition {
  id: BasemapId;
  displayName: string;
  kind: BasemapKind;
  dark: boolean;
  rasterBaseMapId?: CartoRasterBasemapId;
}

export interface RasterStyleSpecification {
  version: 8;
  sources: {
    "raster-tiles": {
      type: "raster";
      tiles: string[];
      tileSize: 256;
      attribution: string;
    };
  };
  layers: Array<{
    id: string;
    type: "raster";
    source: "raster-tiles";
    minzoom: number;
    maxzoom: number;
  }>;
}

export interface BlankStyleSpecification {
  version: 8;
  sources: Record<string, never>;
  layers: [];
}

export type BasemapStyleSpecification =
  | RasterStyleSpecification
  | BlankStyleSpecification;

const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const WEB_APP_BASEMAPS = new Map<WebAppBasemapId, BasemapDefinition>([
  [
    "positron",
    {
      id: "positron",
      displayName: "Light (Positron)",
      kind: "carto-raster",
      dark: false,
      rasterBaseMapId: "light_all",
    },
  ],
  [
    "positron_no_labels",
    {
      id: "positron_no_labels",
      displayName: "Light, no labels",
      kind: "carto-raster",
      dark: false,
      rasterBaseMapId: "light_nolabels",
    },
  ],
  [
    "dark_matter",
    {
      id: "dark_matter",
      displayName: "Dark (Dark Matter)",
      kind: "carto-raster",
      dark: true,
      rasterBaseMapId: "dark_all",
    },
  ],
  [
    "dark_matter_no_labels",
    {
      id: "dark_matter_no_labels",
      displayName: "Dark, no labels",
      kind: "carto-raster",
      dark: true,
      rasterBaseMapId: "dark_nolabels",
    },
  ],
  [
    "blank",
    {
      id: "blank",
      displayName: "Blank",
      kind: "blank",
      dark: false,
    },
  ],
]);

const VOYAGER_BASEMAPS = new Map<CartoRasterBasemapId, BasemapDefinition>([
  [
    "rastertiles/voyager",
    {
      id: "rastertiles/voyager",
      displayName: "Voyager (Colour)",
      kind: "carto-raster",
      dark: false,
      rasterBaseMapId: "rastertiles/voyager",
    },
  ],
  [
    "rastertiles/voyager_nolabels",
    {
      id: "rastertiles/voyager_nolabels",
      displayName: "Voyager, no labels",
      kind: "carto-raster",
      dark: false,
      rasterBaseMapId: "rastertiles/voyager_nolabels",
    },
  ],
]);

const CARTO_RASTER_BASEMAPS = new Map<CartoRasterBasemapId, BasemapDefinition>(
  CARTO_RASTER_BASEMAP_IDS.map((id) => [
    id,
    {
      id,
      displayName: id,
      kind: "carto-raster",
      dark: id.startsWith("dark") || id.includes("/dark"),
      rasterBaseMapId: id,
    },
  ]),
);

export const basemapOptions: BasemapOption[] = [
  ...Array.from(WEB_APP_BASEMAPS.values()),
  ...Array.from(VOYAGER_BASEMAPS.values()),
].map(({ id, displayName }) => ({ value: id, displayName }));

const BASEMAP_ALIASES = new Map<string, BasemapId>([
  ["deck_light", "positron"],
  ["light_all", "positron"],
  ["light_nolabels", "positron_no_labels"],
  ["light_only_labels", "positron"],
  ["deck_dark", "dark_matter"],
  ["dark_all", "dark_matter"],
  ["dark_nolabels", "dark_matter_no_labels"],
  ["dark_only_labels", "dark_matter"],
  ["rastertiles/voyager_only_labels", "rastertiles/voyager"],
  ["rastertiles/voyager_labels_under", "rastertiles/voyager"],
  ["openfreemap/bright", "positron"],
  ["openfreemap/liberty", "rastertiles/voyager"],
  ["openfreemap/positron", "positron_no_labels"],
]);

export const resolveBasemapAlias = (baseMap: unknown): BasemapId => {
  const id = typeof baseMap === "string" ? baseMap : DEFAULT_BASEMAP_ID;
  return BASEMAP_ALIASES.get(id) ?? (id as BasemapId);
};

export const resolveBasemap = (baseMap: unknown): BasemapDefinition => {
  const id = resolveBasemapAlias(baseMap);
  return (
    WEB_APP_BASEMAPS.get(id as WebAppBasemapId) ??
    VOYAGER_BASEMAPS.get(id as CartoRasterBasemapId) ??
    CARTO_RASTER_BASEMAPS.get(id as CartoRasterBasemapId) ??
    WEB_APP_BASEMAPS.get(DEFAULT_BASEMAP_ID)!
  );
};

const getCartoRasterStyle = (
  baseMap: CartoRasterBasemapId,
): RasterStyleSpecification => {
  return {
    version: 8,
    sources: {
      "raster-tiles": {
        type: "raster",
        tiles: [
          `https://a.basemaps.cartocdn.com/${baseMap}/{z}/{x}/{y}{r}.png`,
          `https://b.basemaps.cartocdn.com/${baseMap}/{z}/{x}/{y}{r}.png`,
          `https://c.basemaps.cartocdn.com/${baseMap}/{z}/{x}/{y}{r}.png`,
          `https://d.basemaps.cartocdn.com/${baseMap}/{z}/{x}/{y}{r}.png`,
        ],
        tileSize: 256,
        attribution: CARTO_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: "simple-tiles",
        type: "raster",
        source: "raster-tiles",
        minzoom: 0,
        maxzoom: 20,
      },
    ],
  };
};

export const getBasemapStyle = (
  baseMap: unknown,
): BasemapStyleSpecification => {
  const definition = resolveBasemap(baseMap);

  if (definition.kind === "blank") {
    return {
      version: 8,
      sources: {},
      layers: [],
    };
  }

  return getCartoRasterStyle(definition.rasterBaseMapId ?? "light_all");
};
