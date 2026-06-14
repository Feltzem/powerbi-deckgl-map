import {
  Geometry,
  LineString,
  MultiLineString,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";

/**
 * A coordinate carries Z when it has a third ordinate that is a finite number.
 * WKP strings whose header declares D >= 3 decode to [x, y, z] positions; D = 2
 * strings decode to [x, y]. We only treat a position as 3D when the Z is usable.
 */
export const positionHasZ = (position: Position): boolean =>
  position.length >= 3 &&
  typeof position[2] === "number" &&
  Number.isFinite(position[2]);

const lineStringHasZ = (geometry: LineString): boolean =>
  geometry.coordinates.some(positionHasZ);

const multiLineStringHasZ = (geometry: MultiLineString): boolean =>
  geometry.coordinates.some((line) => line.some(positionHasZ));

const polygonHasZ = (geometry: Polygon): boolean =>
  geometry.coordinates.some((ring) => ring.some(positionHasZ));

const multiPolygonHasZ = (geometry: MultiPolygon): boolean =>
  geometry.coordinates.some((polygon) =>
    polygon.some((ring) => ring.some(positionHasZ)),
  );

/**
 * Returns true when any vertex of the geometry carries a finite Z ordinate, so
 * callers can switch the matching deck.gl layer to positionFormat "XYZ".
 */
export const geometryHasZ = (geometry: Geometry | null | undefined): boolean => {
  if (!geometry) {
    return false;
  }
  switch (geometry.type) {
    case "LineString":
      return lineStringHasZ(geometry);
    case "MultiLineString":
      return multiLineStringHasZ(geometry);
    case "Polygon":
      return polygonHasZ(geometry);
    case "MultiPolygon":
      return multiPolygonHasZ(geometry);
    default:
      return false;
  }
};
