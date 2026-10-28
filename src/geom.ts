import { BoundingBox, OurData } from './dataTypes';

/**
 * The narrowest longitude range covering every value, allowing it to cross the antimeridian: the complement of
 * the widest gap between neighbouring longitudes around the circle.
 *
 * Finds that gap in linear time with the pigeonhole method instead of sorting. With n values in n equal buckets
 * over [lo, hi], any gap inside a bucket is narrower than (hi - lo) / n, while the widest gap is at least
 * (hi - lo) / (n - 1), so the widest gap always lies between neighbouring non-empty buckets. Buckets are walked
 * in ascending order and the wrap-around gap is checked last, so ties resolve exactly as a sorted scan would.
 */
function getMinimalLongitudeRange(
    lons: ArrayLike<number>,
    count = lons.length,
): { minLon: number; maxLon: number } | null {
    if (count === 0) {
        return null;
    }

    const normalized = new Float64Array(count);
    let length = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < count; i++) {
        const lon = lons[i];
        if (Number.isFinite(lon)) {
            const value = lon < 0 ? lon + 360 : lon;
            normalized[length++] = value;
            if (value < lo) lo = value;
            if (value > hi) hi = value;
        }
    }
    if (length === 0) {
        return null;
    }
    if (length === 1) {
        const lon = lo > 180 ? lo - 360 : lo;
        return { minLon: lon, maxLon: lon };
    }

    // Widest gap: start with the wrap-around gap's competitors (inside [lo, hi]); the wrap gap is compared last.
    let largestGap = -1;
    let rangeStart = lo;
    let rangeEnd = hi;
    if (hi > lo) {
        const bucketMin = new Float64Array(length).fill(Infinity);
        const bucketMax = new Float64Array(length).fill(-Infinity);
        const scale = length / (hi - lo);
        for (let i = 0; i < length; i++) {
            const value = normalized[i];
            let bucket = Math.floor((value - lo) * scale);
            if (bucket >= length) bucket = length - 1;
            if (value < bucketMin[bucket]) bucketMin[bucket] = value;
            if (value > bucketMax[bucket]) bucketMax[bucket] = value;
        }
        let previousMax = bucketMax[0];
        for (let bucket = 1; bucket < length; bucket++) {
            const min = bucketMin[bucket];
            if (min === Infinity) continue;
            const gap = min - previousMax;
            if (gap > largestGap) {
                largestGap = gap;
                rangeStart = min;
                rangeEnd = previousMax;
            }
            previousMax = bucketMax[bucket];
        }
    }
    const wrapGap = lo + 360 - hi;
    if (wrapGap > largestGap) {
        rangeStart = lo;
        rangeEnd = hi;
    }

    if (rangeEnd < rangeStart) {
        rangeEnd += 360;
    }

    if (rangeStart > 180 && rangeEnd > 180) {
        return { minLon: rangeStart - 360, maxLon: rangeEnd - 360 };
    }

    return {
        minLon: rangeStart > 180 ? rangeStart - 360 : rangeStart,
        maxLon: rangeEnd,
    };
}

/**
 * Call `visit(lon, lat)` for every position of a data point, in the same order as `getLatLons`, without
 * building intermediate arrays. Returns false as soon as `visit` does.
 */
function visitLonLats(d: OurData, visit: (lon: number, lat: number) => boolean | void): boolean {
    const line = (coords: number[][]) => {
        for (let i = 0; i < coords.length; i++) {
            if (visit(coords[i][0], coords[i][1]) === false) return false;
        }
        return true;
    };
    if (d.scatterData && visit(d.scatterData.lon, d.scatterData.lat) === false) return false;
    if (d.lineData) {
        if (visit(d.lineData.point1.lon, d.lineData.point1.lat) === false) return false;
        if (visit(d.lineData.point2.lon, d.lineData.point2.lat) === false) return false;
    }
    if (d.arcData) {
        if (visit(d.arcData.point1.lon, d.arcData.point1.lat) === false) return false;
        if (visit(d.arcData.point2.lon, d.arcData.point2.lat) === false) return false;
    }
    if (d.pathData) {
        const path = d.pathData;
        if (path.bbox) {
            // getLatLons pairs bbox[1] with bbox[0] and bbox[3] with bbox[2].
            if (visit(path.bbox[0], path.bbox[1]) === false || visit(path.bbox[2], path.bbox[3]) === false) return false;
        } else if (path.type === "LineString") {
            if (!line(path.coordinates)) return false;
        } else if (path.type === "MultiLineString") {
            for (const part of path.coordinates) if (!line(part)) return false;
        }
    }
    if (d.polygonData) {
        const polygon = d.polygonData;
        if (polygon.bbox) {
            if (visit(polygon.bbox[0], polygon.bbox[1]) === false || visit(polygon.bbox[2], polygon.bbox[3]) === false) return false;
        } else if (polygon.type === "Polygon") {
            for (const ring of polygon.coordinates) if (!line(ring)) return false;
        } else if (polygon.type === "MultiPolygon") {
            for (const part of polygon.coordinates) for (const ring of part) if (!line(ring)) return false;
        }
    }
    return true;
}

export function getLatLons(d: OurData): number[][] {
    const lats: number[] = [];
    const lons: number[] = [];
    if (d.scatterData) {
        lats.push(d.scatterData.lat);
        lons.push(d.scatterData.lon);
    }
    if (d.lineData) {
        const p1 = d.lineData.point1;
        const p2 = d.lineData.point2;
        lats.push(p1.lat, p2.lat);
        lons.push(p1.lon, p2.lon);
    }
    if (d.arcData) {
        const p1 = d.arcData.point1;
        const p2 = d.arcData.point2;
        lats.push(p1.lat, p2.lat);
        lons.push(p1.lon, p2.lon);
    }
    if (d.pathData) {
        if (d.pathData.bbox) {
            lats.push(d.pathData.bbox[1], d.pathData.bbox[3]);
            lons.push(d.pathData.bbox[0], d.pathData.bbox[2]);
        } else {
            if (d.pathData.type === "LineString") {
                for (const coord of d.pathData.coordinates) {
                    lons.push(coord[0]);
                    lats.push(coord[1]);
                }
            } else if (d.pathData.type === "MultiLineString") {
                for (const line of d.pathData.coordinates) {
                    for (const coord of line) {
                        lons.push(coord[0]);
                        lats.push(coord[1]);
                    }
                }
            }
        }
    }
    if (d.polygonData) {
        if (d.polygonData.bbox) {
            lats.push(d.polygonData.bbox[1], d.polygonData.bbox[3]);
            lons.push(d.polygonData.bbox[0], d.polygonData.bbox[2]);
        } else {
            if (d.polygonData.type === "Polygon") {
                for (const ring of d.polygonData.coordinates) {
                    for (const coord of ring) {
                        lons.push(coord[0]);
                        lats.push(coord[1]);
                    }
                }
            } else if (d.polygonData.type === "MultiPolygon") {
                for (const polygon of d.polygonData.coordinates) {
                    for (const ring of polygon) {
                        for (const coord of ring) {
                            lons.push(coord[0]);
                            lats.push(coord[1]);
                        }
                    }
                }
            }
        }
    }
    return [lats, lons];
}


export function getDataBoundingBox(data: OurData[]): BoundingBox | null {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let lons = new Float64Array(1024);
    let count = 0;
    const visit = (lon: number, lat: number) => {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (count === lons.length) {
            const grown = new Float64Array(lons.length * 2);
            grown.set(lons);
            lons = grown;
        }
        lons[count++] = lon;
    };
    for (const d of data) {
        visitLonLats(d, visit);
    }
    const lonRange = getMinimalLongitudeRange(lons, count);
    if (!lonRange || minLat === Infinity || maxLat === -Infinity) {
        return null; // No valid data found
    }
    return { minLon: lonRange.minLon, minLat, maxLon: lonRange.maxLon, maxLat };
}


export function validateData(data: OurData): boolean {
    // Same checks as before: every latitude in [-90, 90] and every longitude in [-180, 180], NaN rejected.
    return visitLonLats(
        data,
        (lon, lat) => !(isNaN(lat) || !isFinite(lat) || lat < -90 || lat > 90 || isNaN(lon) || !isFinite(lon) || lon < -180 || lon > 180),
    );
}
