import powerbi from "powerbi-visuals-api";

import ISelectionId = powerbi.visuals.ISelectionId;
import {
  Geometry,
  Polygon,
  MultiPolygon,
  LineString,
  MultiLineString,
} from "geojson";
import { RGBAColor } from "./col";
import { TimeDomain } from "./time";

type PrimitiveValue = powerbi.PrimitiveValue;

// Enum for supported layer types
export enum InputLayerType {
  Scatter = "scatter",
  Path = "path",
  Polygon = "polygon",
  Line = "line",
  Arc = "arc",
  MultiPoint = "multipoint",
}

// Data types:
export interface PointData {
  lon: number;
  lat: number;
}
export interface ScatterData extends PointData {
  radius: number | null; // in meters
  elevation: number | null; // in meters
  heatmapWeight: number | null;
}
export interface LineData {
  point1: PointData;
  point2: PointData;
}
export interface ArcData extends LineData {}
// Properties:
interface StrokedProperties {
  lineWidth: number | null;
  lineColor: RGBAColor | null;
  lineColorValue: number | null;
  lineColorCategory: string | null;
}
interface TooltipProperties {
  id?: string;
  tooltipHtml?: string | null;
}
interface FilledProperties {
  fillColor: RGBAColor | null;
  fillColorValue: number | null;
  fillColorCategory: string | null;
}
export interface LineProperties extends StrokedProperties {}
export interface PathProperties extends StrokedProperties, TooltipProperties {}
export interface PolygonProperties
  extends StrokedProperties,
    FilledProperties,
    TooltipProperties {
  elevation: number | null; // in meters
}
export interface ScatterProperties
  extends StrokedProperties, FilledProperties {}
export interface ArcProperties {
  lineWidth: number | null;
  sourceColor: RGBAColor | null;
  sourceColorValue: number | null;
  sourceColorCategory: string | null;
  targetColor: RGBAColor | null;
  targetColorValue: number | null;
  targetColorCategory: string | null;
}

export interface OurData {
  id: string;
  type: InputLayerType | null;
  lineData?: LineData | null;
  lineProperties?: LineProperties | null;
  scatterData?: ScatterData | null;
  scatterProperties?: ScatterProperties | null;
  arcData?: ArcData | null;
  arcProperties?: ArcProperties | null;
  pathData?: LineString | MultiLineString | null;
  pathProperties?: PathProperties | null;
  polygonData?: Polygon | MultiPolygon | null;
  polygonProperties?: PolygonProperties | null;
  isHighlightedFromData?: boolean;
  selectionId: ISelectionId;
  tooltipHtml: string | null;
  /** Bound timestamp normalised to Unix seconds, or null when unbound/blank. */
  timestampSeconds: number | null;
}

export interface PathFeature {
  type: "Feature";
  geometry: LineString | MultiLineString;
  properties: PathProperties;
  selectionId: ISelectionId;
  tooltipHtml: string | null;
  id: string;
  /** True when the geometry carries a finite Z ordinate (3D WKP). */
  hasZ: boolean;
  /** Bound timestamp normalised to Unix seconds, or null when unbound/blank. */
  timestampSeconds: number | null;
}

export interface PolygonFeature {
  type: "Feature";
  geometry: Polygon | MultiPolygon;
  properties: PolygonProperties;
  selectionId: ISelectionId;
  tooltipHtml: string | null;
  id: string;
  /** True when the ring vertices carry a finite Z ordinate (3D WKP). */
  hasZ: boolean;
  /** Bound timestamp normalised to Unix seconds, or null when unbound/blank. */
  timestampSeconds: number | null;
}

export interface LayerDataStore {
  all: OurData[];
  scatter: OurData[];
  line: OurData[];
  arc: OurData[];
  path: PathFeature[];
  polygon: PolygonFeature[];
}

export type ColorRoleKey =
  | "scatterFillColor"
  | "scatterLineColor"
  | "lineLineColor"
  | "pathColor"
  | "polygonFillColor"
  | "polygonLineColor"
  | "arcSourceColor"
  | "arcTargetColor";

export interface ColorRoleStats {
  hasTextColor: boolean;
  hasNumericColor: boolean;
  hasCategoricalColor: boolean;
  minValue: number | null;
  maxValue: number | null;
  categoryCounts: Map<string, number>;
  categoryOrder: string[];
}

export type ColorRoleStatsStore = Record<ColorRoleKey, ColorRoleStats>;

export interface DatasetSnapshot {
  layers: LayerDataStore;
  colorRoles: ColorRoleStatsStore;
  idToDataPoint: Map<string, OurData>;
  idToSelectionId: Map<string, ISelectionId>;
  dataHighlightedIds: string[];
  bounds: BoundingBox | null;
  version: string;
  /**
   * [t0, t1] in Unix seconds across all bound timestamps, or null when no
   * timestamp role is bound (animation inert).
   */
  timeDomain: TimeDomain | null;
  /** True when a field is bound to the polygonExtrudeElevation data role. */
  elevationFieldBound: boolean;
  /** True when a field is bound to the scatterElevation data role. */
  scatterElevationFieldBound: boolean;
  /** True when at least one scatter row has a finite, non-zero elevation. */
  scatterHasVisibleElevation: boolean;
}

export type GeometryCache = Map<string, Geometry>;

export interface RowValues {
  geometryId: PrimitiveValue | null;
  layerType: PrimitiveValue | null;
  wkp: PrimitiveValue | null;
  wkt: PrimitiveValue | null;
  point1Latitude: PrimitiveValue | null;
  point1Longitude: PrimitiveValue | null;
  point2Latitude: PrimitiveValue | null;
  point2Longitude: PrimitiveValue | null;
  scatterRadius: PrimitiveValue | null;
  scatterElevation: PrimitiveValue | null;
  heatmapWeight: PrimitiveValue | null;
  scatterLineColor: PrimitiveValue | null;
  scatterLineWidth: PrimitiveValue | null;
  scatterFillColor: PrimitiveValue | null;
  lineLineWidth: PrimitiveValue | null;
  lineLineColor: PrimitiveValue | null;
  pathWidth: PrimitiveValue | null;
  pathColor: PrimitiveValue | null;
  polygonLineColor: PrimitiveValue | null;
  polygonLineWidth: PrimitiveValue | null;
  polygonFillColor: PrimitiveValue | null;
  polygonExtrudeElevation: PrimitiveValue | null;
  arcLineWidth: PrimitiveValue | null;
  arcSourceColor: PrimitiveValue | null;
  arcTargetColor: PrimitiveValue | null;
  tooltip: PrimitiveValue | null;
  timestamp: PrimitiveValue | null;
}

export type RowValueArrays = {
  [K in keyof RowValues]: PrimitiveValue[] | null;
};

export type RowValueAvailability = {
  [K in keyof RowValues]: boolean;
};

export const createEmptyLayerDataStore = (): LayerDataStore => ({
  all: [],
  scatter: [],
  line: [],
  arc: [],
  path: [],
  polygon: [],
});

export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}
