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

export const AERIAL_BASEMAP_IDS = [
  "esri_world_imagery",
  "mapbox_satellite",
] as const;

export const DEFAULT_BASEMAP_ID = "positron";
export const ESRI_WORLD_IMAGERY_BASEMAP_ID = "esri_world_imagery";
export const MAPBOX_SATELLITE_BASEMAP_ID = "mapbox_satellite";
export const BASEMAP_RASTER_SOURCE_ID = "raster-tiles";
export const BASEMAP_RASTER_LAYER_ID = "simple-tiles";

export type CartoRasterBasemapId = (typeof CARTO_RASTER_BASEMAP_IDS)[number];
export type WebAppBasemapId = (typeof WEB_APP_BASEMAP_IDS)[number];
export type AerialBasemapId = (typeof AERIAL_BASEMAP_IDS)[number];
export type BasemapId =
  | CartoRasterBasemapId
  | WebAppBasemapId
  | AerialBasemapId;
export type BasemapKind =
  | "carto-raster"
  | "esri-raster"
  | "mapbox-raster"
  | "blank";

export interface BasemapOption {
  value: BasemapId;
  displayName: string;
}

export interface BasemapDefinition {
  id: BasemapId;
  displayName: string;
  kind: BasemapKind;
  dark: boolean;
  isAerial: boolean;
  rasterBaseMapId?: CartoRasterBasemapId;
}

export interface BasemapStyleOptions {
  mapboxAccessToken?: unknown;
  cartoApiKey?: unknown;
  aerialOpacity?: unknown;
}

export interface RasterStyleSpecification {
  version: 8;
  sources: {
    [BASEMAP_RASTER_SOURCE_ID]: {
      type: "raster";
      tiles: string[];
      tileSize: 256;
      attribution: string;
    };
  };
  layers: Array<{
    id: string;
    type: "raster";
    source: typeof BASEMAP_RASTER_SOURCE_ID;
    minzoom: number;
    maxzoom: number;
    paint: {
      "raster-opacity": number;
    };
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

const ESRI_WORLD_IMAGERY_ATTRIBUTION =
  'Source: <a href="https://goto.arcgisonline.com/maps/World_Imagery">Esri, Vantor, Earthstar Geographics, and the GIS User Community</a>';

const MAPBOX_SATELLITE_ATTRIBUTION =
  '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a>';

const WEB_APP_BASEMAPS = new Map<WebAppBasemapId, BasemapDefinition>([
  [
    "positron",
    {
      id: "positron",
      displayName: "Light (Positron)",
      kind: "carto-raster",
      dark: false,
      isAerial: false,
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
      isAerial: false,
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
      isAerial: false,
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
      isAerial: false,
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
      isAerial: false,
    },
  ],
]);

const AERIAL_BASEMAPS = new Map<AerialBasemapId, BasemapDefinition>([
  [
    ESRI_WORLD_IMAGERY_BASEMAP_ID,
    {
      id: ESRI_WORLD_IMAGERY_BASEMAP_ID,
      displayName: "Satellite (Esri World Imagery)",
      kind: "esri-raster",
      dark: true,
      isAerial: true,
    },
  ],
  [
    MAPBOX_SATELLITE_BASEMAP_ID,
    {
      id: MAPBOX_SATELLITE_BASEMAP_ID,
      displayName: "Satellite (Mapbox BYOK)",
      kind: "mapbox-raster",
      dark: true,
      isAerial: true,
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
      isAerial: false,
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
      isAerial: false,
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
      isAerial: false,
      rasterBaseMapId: id,
    },
  ]),
);

export const basemapOptions: BasemapOption[] = [
  WEB_APP_BASEMAPS.get("positron")!,
  WEB_APP_BASEMAPS.get("positron_no_labels")!,
  WEB_APP_BASEMAPS.get("dark_matter")!,
  WEB_APP_BASEMAPS.get("dark_matter_no_labels")!,
  ...Array.from(AERIAL_BASEMAPS.values()),
  WEB_APP_BASEMAPS.get("blank")!,
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
    AERIAL_BASEMAPS.get(id as AerialBasemapId) ??
    VOYAGER_BASEMAPS.get(id as CartoRasterBasemapId) ??
    CARTO_RASTER_BASEMAPS.get(id as CartoRasterBasemapId) ??
    WEB_APP_BASEMAPS.get(DEFAULT_BASEMAP_ID)!
  );
};

export const isAerialBasemap = (baseMap: unknown): boolean =>
  resolveBasemap(baseMap).isAerial;

export const isMapboxSatelliteBasemap = (baseMap: unknown): boolean =>
  resolveBasemap(baseMap).id === MAPBOX_SATELLITE_BASEMAP_ID;

export const normalizeMapboxAccessToken = (token: unknown): string =>
  typeof token === "string" ? token.trim() : "";

export const normalizeCartoApiKey = (key: unknown): string =>
  typeof key === "string" ? key.trim() : "";

export const clampAerialBasemapOpacity = (opacity: unknown): number => {
  const numericOpacity =
    typeof opacity === "number" && Number.isFinite(opacity) ? opacity : 100;
  return Math.max(0, Math.min(100, numericOpacity)) / 100;
};

export const getBasemapStyleSignature = (
  baseMap: unknown,
  mapboxAccessToken?: unknown,
  cartoApiKey?: unknown,
): string => {
  const definition = resolveBasemap(baseMap);
  const credential =
    definition.kind === "mapbox-raster"
      ? normalizeMapboxAccessToken(mapboxAccessToken)
      : definition.kind === "carto-raster"
        ? normalizeCartoApiKey(cartoApiKey)
        : "";

  return `${definition.id}:${credential}`;
};

const getRasterStyle = (
  tiles: string[],
  attribution: string,
  opacity = 1,
): RasterStyleSpecification => {
  return {
    version: 8,
    sources: {
      [BASEMAP_RASTER_SOURCE_ID]: {
        type: "raster",
        tiles,
        tileSize: 256,
        attribution,
      },
    },
    layers: [
      {
        id: BASEMAP_RASTER_LAYER_ID,
        type: "raster",
        source: BASEMAP_RASTER_SOURCE_ID,
        minzoom: 0,
        maxzoom: 20,
        paint: {
          "raster-opacity": opacity,
        },
      },
    ],
  };
};

const getCartoRasterStyle = (
  baseMap: CartoRasterBasemapId,
  cartoApiKey: string,
): RasterStyleSpecification =>
  getRasterStyle(
    ["a", "b", "c", "d"].map(
      (subdomain) =>
        `https://${subdomain}.basemaps.cartocdn.com/${baseMap}/{z}/{x}/{y}{r}.png${
          cartoApiKey ? `?key=${encodeURIComponent(cartoApiKey)}` : ""
        }`,
    ),
    CARTO_ATTRIBUTION,
  );

const getEsriWorldImageryStyle = (opacity: number): RasterStyleSpecification =>
  getRasterStyle(
    [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    ESRI_WORLD_IMAGERY_ATTRIBUTION,
    opacity,
  );

const getMapboxSatelliteStyle = (
  mapboxAccessToken: string,
  opacity: number,
): RasterStyleSpecification =>
  getRasterStyle(
    [
      `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.jpg90?access_token=${encodeURIComponent(
        mapboxAccessToken,
      )}`,
    ],
    MAPBOX_SATELLITE_ATTRIBUTION,
    opacity,
  );

export const getBasemapStyle = (
  baseMap: unknown,
  options: BasemapStyleOptions = {},
): BasemapStyleSpecification => {
  const definition = resolveBasemap(baseMap);
  const opacity = definition.isAerial
    ? clampAerialBasemapOpacity(options.aerialOpacity)
    : 1;

  if (definition.kind === "blank") {
    return {
      version: 8,
      sources: {},
      layers: [],
    };
  }

  if (definition.kind === "esri-raster") {
    return getEsriWorldImageryStyle(opacity);
  }

  if (definition.kind === "mapbox-raster") {
    const mapboxAccessToken = normalizeMapboxAccessToken(
      options.mapboxAccessToken,
    );

    if (!mapboxAccessToken) {
      return getEsriWorldImageryStyle(opacity);
    }

    return getMapboxSatelliteStyle(mapboxAccessToken, opacity);
  }

  return getCartoRasterStyle(
    definition.rasterBaseMapId ?? "light_all",
    normalizeCartoApiKey(options.cartoApiKey),
  );
};
