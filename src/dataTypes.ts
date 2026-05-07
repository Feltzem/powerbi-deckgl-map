import powerbi from "powerbi-visuals-api";

import ISelectionId = powerbi.visuals.ISelectionId;
import {
  Geometry,
  Polygon,
  MultiPolygon,
  LineString,
  MultiLineString,
} from "geojson";

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
}
export interface LineData {
  point1: PointData;
  point2: PointData;
}
export interface ArcData extends LineData {}
// Properties:
interface StrokedProperties {
  lineWidth: number | null;
  lineColor: string | null;
  lineColorValue: number | null;
}
interface FilledProperties {
  fillColor: string | null;
  fillColorValue: number | null;
}
export interface LineProperties extends StrokedProperties {}
export interface PathProperties extends StrokedProperties {}
export interface PolygonProperties extends StrokedProperties, FilledProperties {
  elevation: number | null; // in meters
}
export interface ScatterProperties
  extends StrokedProperties, FilledProperties {}
export interface ArcProperties {
  lineWidth: number | null;
  sourceColor: string | null;
  sourceColorValue: number | null;
  targetColor: string | null;
  targetColorValue: number | null;
}

export interface OurData {
  id: string;
  type: InputLayerType;
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
}

export interface PathFeature {
  type: "Feature";
  geometry: LineString | MultiLineString;
  properties: PathProperties;
  selectionId: ISelectionId;
  tooltipHtml: string | null;
  id: string;
}

export interface PolygonFeature {
  type: "Feature";
  geometry: Polygon | MultiPolygon;
  properties: PolygonProperties;
  selectionId: ISelectionId;
  tooltipHtml: string | null;
  id: string;
}

export interface LayerDataStore {
  all: OurData[];
  scatter: OurData[];
  line: OurData[];
  arc: OurData[];
  path: PathFeature[];
  polygon: PolygonFeature[];
}

export interface DatasetSnapshot {
  layers: LayerDataStore;
  idToDataPoint: Map<string, OurData>;
  idToSelectionId: Map<string, ISelectionId>;
  dataHighlightedIds: string[];
  bounds: BoundingBox | null;
  version: string;
}

export type GeometryCache = Map<string, Geometry>;

export interface RowValues {
  geometryId: any | null;
  layerType: any | null;
  wkp: any | null;
  wkt: any | null;
  point1Latitude: any | null;
  point1Longitude: any | null;
  point2Latitude: any | null;
  point2Longitude: any | null;
  scatterRadius: any | null;
  scatterLineColor: any | null;
  scatterLineWidth: any | null;
  scatterFillColor: any | null;
  lineLineWidth: any | null;
  lineLineColor: any | null;
  pathWidth: any | null;
  pathColor: any | null;
  polygonLineColor: any | null;
  polygonLineWidth: any | null;
  polygonFillColor: any | null;
  polygonExtrudeElevation: any | null;
  arcLineWidth: any | null;
  arcSourceColor: any | null;
  arcTargetColor: any | null;
  tooltip: any | null;
}

export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}
