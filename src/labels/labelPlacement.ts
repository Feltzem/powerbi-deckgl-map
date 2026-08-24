import type { Position } from "@deck.gl/core";
import type {
  LineString,
  MultiLineString,
  MultiPolygon,
  Polygon,
} from "geojson";
import {
  InputLayerType,
  OurData,
  PathFeature,
  PointData,
  PolygonFeature,
} from "../dataTypes";
import { getScatterPosition } from "../layers/scatter";

export type LabelAnchor = [number, number, number];
type Coordinate = readonly number[];
type Ring = readonly Coordinate[];

const FALLBACK_ANCHOR: LabelAnchor = [0, 0, 0];
const EPSILON = 1e-12;

const finiteOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const coordinateToAnchor = (
  coordinate: Coordinate | null | undefined,
  defaultZ = 0,
): LabelAnchor => {
  if (!coordinate || coordinate.length < 2) {
    return [...FALLBACK_ANCHOR];
  }

  return [
    finiteOr(coordinate[0], FALLBACK_ANCHOR[0]),
    finiteOr(coordinate[1], FALLBACK_ANCHOR[1]),
    finiteOr(coordinate[2], defaultZ),
  ];
};

const pointDataToAnchor = (point: PointData, defaultZ: number): LabelAnchor =>
  coordinateToAnchor(
    [
      point.lon,
      point.lat,
      (point as PointData & { elevation?: number }).elevation,
    ],
    defaultZ,
  );

const midpoint = (left: LabelAnchor, right: LabelAnchor): LabelAnchor => [
  (left[0] + right[0]) / 2,
  (left[1] + right[1]) / 2,
  (left[2] + right[2]) / 2,
];

const distance = (left: LabelAnchor, right: LabelAnchor): number =>
  Math.hypot(right[0] - left[0], right[1] - left[1], right[2] - left[2]);

export const getPointLabelAnchor = (data: OurData): LabelAnchor =>
  data.scatterData ? getScatterPosition(data) : [...FALLBACK_ANCHOR];

export const getLineLabelAnchor = (data: OurData): LabelAnchor => {
  if (!data.lineData) {
    return [...FALLBACK_ANCHOR];
  }

  return midpoint(
    pointDataToAnchor(data.lineData.point1, 0.1),
    pointDataToAnchor(data.lineData.point2, 0.1),
  );
};

/**
 * ArcLayer's default flat arc reaches its maximum height at the midpoint.
 * The label follows that rendered midpoint instead of sitting on the chord.
 */
export const getArcLabelAnchor = (data: OurData): LabelAnchor => {
  if (!data.arcData) {
    return [...FALLBACK_ANCHOR];
  }

  const source = pointDataToAnchor(data.arcData.point1, 0);
  const target = pointDataToAnchor(data.arcData.point2, 0);
  const chordMidpoint = midpoint(source, target);
  const arcHeight = distance(source, target) / 2;
  return [chordMidpoint[0], chordMidpoint[1], chordMidpoint[2] + arcHeight];
};

const validCoordinates = (coordinates: readonly Coordinate[]): Coordinate[] =>
  coordinates.filter(
    (coordinate) =>
      coordinate.length >= 2 &&
      Number.isFinite(coordinate[0]) &&
      Number.isFinite(coordinate[1]),
  ) as Coordinate[];

const componentLength = (coordinates: readonly Coordinate[]): number => {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    total += distance(
      coordinateToAnchor(coordinates[index - 1]),
      coordinateToAnchor(coordinates[index]),
    );
  }
  return total;
};

export const getLineStringLabelAnchor = (
  coordinates: readonly Coordinate[],
): LabelAnchor => {
  const points = validCoordinates(coordinates);
  if (points.length === 0) {
    return [...FALLBACK_ANCHOR];
  }
  if (points.length === 1) {
    return coordinateToAnchor(points[0]);
  }

  const targetDistance = componentLength(points) / 2;
  if (targetDistance <= EPSILON) {
    return coordinateToAnchor(points[0]);
  }

  let traversed = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = coordinateToAnchor(points[index - 1]);
    const end = coordinateToAnchor(points[index]);
    const segmentLength = distance(start, end);
    if (segmentLength <= EPSILON) {
      continue;
    }
    if (traversed + segmentLength >= targetDistance) {
      const ratio = (targetDistance - traversed) / segmentLength;
      return [
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
        start[2] + (end[2] - start[2]) * ratio,
      ];
    }
    traversed += segmentLength;
  }

  return coordinateToAnchor(points[points.length - 1]);
};

export const getPathLabelAnchor = (
  geometry: LineString | MultiLineString | null | undefined,
): LabelAnchor => {
  if (!geometry) {
    return [...FALLBACK_ANCHOR];
  }

  const components =
    geometry.type === "LineString"
      ? [geometry.coordinates]
      : geometry.coordinates;
  const longest = components.reduce<readonly Coordinate[] | null>(
    (current, candidate) => {
      if (!current || componentLength(candidate) > componentLength(current)) {
        return candidate;
      }
      return current;
    },
    null,
  );
  return longest ? getLineStringLabelAnchor(longest) : [...FALLBACK_ANCHOR];
};

const ringSignedArea = (ring: Ring): number => {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    if (current.length < 2 || next.length < 2) {
      continue;
    }
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
};

const ringCentroid = (ring: Ring): LabelAnchor | null => {
  const points = validCoordinates(ring);
  if (points.length < 3) {
    return null;
  }

  const area = ringSignedArea(points);
  if (Math.abs(area) <= EPSILON) {
    return null;
  }

  let x = 0;
  let y = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current[0] * next[1] - next[0] * current[1];
    x += (current[0] + next[0]) * cross;
    y += (current[1] + next[1]) * cross;
  }
  return [x / (6 * area), y / (6 * area), 0];
};

const pointInRing = (point: LabelAnchor, ring: Ring): boolean => {
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index++
  ) {
    const current = ring[index];
    const prior = ring[previous];
    if (current.length < 2 || prior.length < 2) {
      continue;
    }
    const intersects =
      current[1] > point[1] !== prior[1] > point[1] &&
      point[0] <
        ((prior[0] - current[0]) * (point[1] - current[1])) /
          (prior[1] - current[1] || EPSILON) +
          current[0];
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
};

const pointInPolygon = (point: LabelAnchor, rings: readonly Ring[]): boolean =>
  rings.length > 0 &&
  pointInRing(point, rings[0]) &&
  !rings.slice(1).some((hole) => pointInRing(point, hole));

const distanceToSegment = (
  point: LabelAnchor,
  start: Coordinate,
  end: Coordinate,
): number => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const ratio =
    lengthSquared <= EPSILON
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
              lengthSquared,
          ),
        );
  return Math.hypot(
    point[0] - (start[0] + dx * ratio),
    point[1] - (start[1] + dy * ratio),
  );
};

const distanceToRings = (
  point: LabelAnchor,
  rings: readonly Ring[],
): number => {
  let minimum = Number.POSITIVE_INFINITY;
  for (const ring of rings) {
    for (let index = 1; index < ring.length; index += 1) {
      minimum = Math.min(
        minimum,
        distanceToSegment(point, ring[index - 1], ring[index]),
      );
    }
  }
  return minimum;
};

const interiorPoint = (rings: readonly Ring[]): LabelAnchor => {
  const centroid = ringCentroid(rings[0]);
  if (centroid && pointInPolygon(centroid, rings)) {
    return centroid;
  }

  const outer = validCoordinates(rings[0]);
  if (outer.length === 0) {
    return [...FALLBACK_ANCHOR];
  }

  let minX = outer[0][0];
  let maxX = outer[0][0];
  let minY = outer[0][1];
  let maxY = outer[0][1];
  for (const coordinate of outer) {
    minX = Math.min(minX, coordinate[0]);
    maxX = Math.max(maxX, coordinate[0]);
    minY = Math.min(minY, coordinate[1]);
    maxY = Math.max(maxY, coordinate[1]);
  }

  let best: LabelAnchor | null = null;
  let bestDistance = -1;
  for (let yIndex = 0; yIndex <= 40; yIndex += 1) {
    const y = minY + ((maxY - minY) * yIndex) / 40;
    for (let xIndex = 0; xIndex <= 40; xIndex += 1) {
      const x = minX + ((maxX - minX) * xIndex) / 40;
      const candidate: LabelAnchor = [x, y, 0];
      if (!pointInPolygon(candidate, rings)) {
        continue;
      }
      const candidateDistance = distanceToRings(candidate, rings);
      if (candidateDistance > bestDistance) {
        best = candidate;
        bestDistance = candidateDistance;
      }
    }
  }

  return best ?? coordinateToAnchor(outer[0]);
};

const largestPolygon = (polygons: readonly Polygon[]): Polygon | null => {
  let largest: Polygon | null = null;
  let largestArea = -1;
  for (const polygon of polygons) {
    const area = Math.abs(ringSignedArea(polygon.coordinates[0] ?? []));
    if (area > largestArea) {
      largest = polygon;
      largestArea = area;
    }
  }
  return largest;
};

export const getPolygonLabelAnchor = (
  geometry: Polygon | MultiPolygon | null | undefined,
  topElevation = 0,
): LabelAnchor => {
  if (!geometry) {
    return [...FALLBACK_ANCHOR];
  }

  const polygon =
    geometry.type === "Polygon"
      ? geometry
      : largestPolygon(
          geometry.coordinates.map((coordinates) => ({
            type: "Polygon" as const,
            coordinates,
          })),
        );
  if (!polygon || polygon.coordinates.length === 0) {
    return [...FALLBACK_ANCHOR];
  }

  const anchor = interiorPoint(polygon.coordinates);
  const z = finiteOr(anchor[2], 0);
  const firstCoordinate = polygon.coordinates[0]?.[0];
  const baseZ =
    firstCoordinate?.length > 2 ? finiteOr(firstCoordinate[2], z) : z;
  return [anchor[0], anchor[1], baseZ + finiteOr(topElevation, 0)];
};

export const getFeatureLabelAnchor = (
  data: OurData | PathFeature | PolygonFeature,
): LabelAnchor => {
  if ("geometry" in data) {
    if (
      data.geometry.type === "LineString" ||
      data.geometry.type === "MultiLineString"
    ) {
      return getPathLabelAnchor(data.geometry);
    }
    return getPolygonLabelAnchor(
      data.geometry,
      "elevation" in data.properties ? (data.properties.elevation ?? 0) : 0,
    );
  }

  switch (data.type) {
    case InputLayerType.Scatter:
      return getPointLabelAnchor(data);
    case InputLayerType.Line:
      return getLineLabelAnchor(data);
    case InputLayerType.Arc:
      return getArcLabelAnchor(data);
    case InputLayerType.Path:
      return getPathLabelAnchor(data.pathData);
    case InputLayerType.Polygon:
      return getPolygonLabelAnchor(
        data.polygonData,
        data.polygonProperties?.elevation ?? 0,
      );
    default:
      return [...FALLBACK_ANCHOR];
  }
};

export const isFiniteLabelAnchor = (anchor: Position): boolean =>
  anchor.length >= 2 &&
  anchor.slice(0, 3).every((value) => Number.isFinite(value));
