/**
 * "Zoom to coordinates": keep the map on a fixed area given by the Map card's
 * south/west/north/east fields instead of fitting to the data.
 */
export interface CoordinateBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface ZoomToCoordinatesInput {
  enabled: boolean;
  lock: boolean;
  south: number;
  west: number;
  north: number;
  east: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * The area as [minLat, maxLat, minLon, maxLon], or null when any value is not a
 * number or the area has no height or width. South/north (and west/east) may
 * be entered either way round. Crossing the antimeridian is not supported.
 */
export const getCoordinateBounds = (
  input: Pick<ZoomToCoordinatesInput, "south" | "west" | "north" | "east">,
): CoordinateBounds | null => {
  const values = [input.south, input.west, input.north, input.east].map(Number);
  if (!values.every(Number.isFinite)) {
    return null;
  }
  const [south, west, north, east] = values;
  const minLat = clamp(Math.min(south, north), -85, 85);
  const maxLat = clamp(Math.max(south, north), -85, 85);
  const minLon = clamp(Math.min(west, east), -180, 180);
  const maxLon = clamp(Math.max(west, east), -180, 180);
  if (maxLat - minLat <= 0 || maxLon - minLon <= 0) {
    return null;
  }
  return { minLat, maxLat, minLon, maxLon };
};

export type LngLatBoundsTuple = [[number, number], [number, number]];

export const toLngLatBounds = (bounds: CoordinateBounds): LngLatBoundsTuple => [
  [bounds.minLon, bounds.minLat],
  [bounds.maxLon, bounds.maxLat],
];

export interface ZoomToCoordinatesState {
  /** The fixed area to show, or null to fit the data as usual. */
  viewBounds: CoordinateBounds | null;
  /** The area the camera is locked to, or null for no lock. */
  maxBounds: CoordinateBounds | null;
  /** Changes whenever the area, the toggle or the lock changes. */
  signature: string;
}

export const getZoomToCoordinatesState = (
  input: ZoomToCoordinatesInput,
): ZoomToCoordinatesState => {
  const bounds = input.enabled ? getCoordinateBounds(input) : null;
  const maxBounds = bounds && input.lock ? bounds : null;
  return {
    viewBounds: bounds,
    maxBounds,
    signature: bounds
      ? `on:${input.lock ? "locked" : "free"}:${bounds.minLat},${bounds.minLon},${bounds.maxLat},${bounds.maxLon}`
      : "off",
  };
};
