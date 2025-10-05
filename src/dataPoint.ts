
import powerbi from "powerbi-visuals-api";

import ISelectionId = powerbi.visuals.ISelectionId;
import { InputGeometryType } from "./enum";

// Data types:
export interface PointData {
    lon: number;
    lat: number;
}
export interface ScatterData extends PointData {
    radius: number;  // in meters
}
export interface LineData {
    point1: PointData;
    point2: PointData;
}
export interface ArcData extends LineData { }
export interface PathData {
    coordinates: PointData[];
}
export interface PolygonData {
    rings: PathData[];
}

// Properties:
interface StrokedProperties {
    lineWidth: number | null;
    lineColor: string | null;
}
interface FilledProperties {
    fillColor: string | null;
}
export interface LineProperties extends StrokedProperties { }
export interface PathProperties extends StrokedProperties { }
export interface PolygonProperties extends StrokedProperties, FilledProperties {
    elevation: number | null; // in meters
}
export interface ScatterProperties extends StrokedProperties, FilledProperties { }
export interface ArcProperties {
    lineWidth: number | null;
    sourceColor: string | null;
    targetColor: string | null;
}

export interface OurData {
    id: string;
    type: InputGeometryType;
    lineData?: LineData | null;
    lineProperties?: LineProperties | null;
    scatterData?: ScatterData | null;
    scatterProperties?: ScatterProperties | null;
    arcData?: ArcData | null;
    arcProperties?: ArcProperties | null;
    pathData?: PathData | null;
    pathProperties?: PathProperties | null;
    polygonData?: PolygonData | null;
    polygonProperties?: PolygonProperties | null;
    selectionId: ISelectionId;
    tooltipHtml: string | null;
}


export function getPointsFromData(data: OurData): PointData[] {
    const points: PointData[] = [];
    if (data.lineData) {
        points.push(data.lineData.point1);
        points.push(data.lineData.point2);
    }
    if (data.scatterData) {
        points.push(data.scatterData);
    }
    if (data.arcData) {
        points.push(data.arcData.point1);
        points.push(data.arcData.point2);
    }
    if (data.pathData) {
        points.push(...data.pathData.coordinates.map(coord => coord));
    }
    if (data.polygonData) {
        points.push(...data.polygonData.rings.flatMap(ring => ring.coordinates.map(coord => coord)));
    }
    return points;
}