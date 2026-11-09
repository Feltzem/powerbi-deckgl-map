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
            if (value >= hi) hi = value;
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
            if (value >= bucketMax[bucket]) bucketMax[bucket] = value;
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

// Visits every coordinate getLatLons reports, in the same order, without
// building arrays. Returns false as soon as visit returns false.
const visitLatLons = (
    d: OurData,
    visit: (lat: number, lon: number) => boolean,
): boolean => {
    if (d.scatterData) {
        if (!visit(d.scatterData.lat, d.scatterData.lon)) return false;
    }
    if (d.lineData) {
        const p1 = d.lineData.point1;
        const p2 = d.lineData.point2;
        if (!visit(p1.lat, p1.lon) || !visit(p2.lat, p2.lon)) return false;
    }
    if (d.arcData) {
        const p1 = d.arcData.point1;
        const p2 = d.arcData.point2;
        if (!visit(p1.lat, p1.lon) || !visit(p2.lat, p2.lon)) return false;
    }
    if (d.pathData) {
        if (d.pathData.bbox) {
            const bbox = d.pathData.bbox;
            if (!visit(bbox[1], bbox[0]) || !visit(bbox[3], bbox[2])) return false;
        } else if (d.pathData.type === "LineString") {
            for (const coord of d.pathData.coordinates) {
                if (!visit(coord[1], coord[0])) return false;
            }
        } else if (d.pathData.type === "MultiLineString") {
            for (const line of d.pathData.coordinates) {
                for (const coord of line) {
                    if (!visit(coord[1], coord[0])) return false;
                }
            }
        }
    }
    if (d.polygonData) {
        if (d.polygonData.bbox) {
            const bbox = d.polygonData.bbox;
            if (!visit(bbox[1], bbox[0]) || !visit(bbox[3], bbox[2])) return false;
        } else if (d.polygonData.type === "Polygon") {
            for (const ring of d.polygonData.coordinates) {
                for (const coord of ring) {
                    if (!visit(coord[1], coord[0])) return false;
                }
            }
        } else if (d.polygonData.type === "MultiPolygon") {
            for (const polygon of d.polygonData.coordinates) {
                for (const ring of polygon) {
                    for (const coord of ring) {
                        if (!visit(coord[1], coord[0])) return false;
                    }
                }
            }
        }
    }
    return true;
};

export function getLatLons(d: OurData): number[][] {
    const lats: number[] = [];
    const lons: number[] = [];
    visitLatLons(d, (lat, lon) => {
        lats.push(lat);
        lons.push(lon);
        return true;
    });
    return [lats, lons];
}


// getMinimalLongitudeRange scans every stored longitude for the widest gap. When
// the wrap-around gap is wider than the whole span, no interior gap can beat
// it (floating-point subtraction is monotonic), so the range is simply the
// first minimum and last maximum, which is what the stable sort would return.
// Wider data falls back to the linear-time widest-gap search.
export function getDataBoundingBox(data: OurData[]): BoundingBox | null {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let lonCount = 0;
    let minNormalized = Infinity;
    let maxNormalized = -Infinity;
    const visit = (lat: number, lon: number): boolean => {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (Number.isFinite(lon)) {
            const normalized = lon < 0 ? lon + 360 : lon;
            lonCount += 1;
            if (normalized < minNormalized) minNormalized = normalized;
            if (normalized >= maxNormalized) maxNormalized = normalized;
        }
        return true;
    };
    for (const d of data) {
        visitLatLons(d, visit);
    }

    let lonRange: { minLon: number; maxLon: number } | null;
    if (lonCount >= 2 && minNormalized + 360 - maxNormalized > maxNormalized - minNormalized) {
        lonRange =
            minNormalized > 180 && maxNormalized > 180
                ? { minLon: minNormalized - 360, maxLon: maxNormalized - 360 }
                : { minLon: minNormalized > 180 ? minNormalized - 360 : minNormalized, maxLon: maxNormalized };
    } else {
        let lons = new Float64Array(1024);
        let count = 0;
        for (const d of data) {
            visitLatLons(d, (_lat, lon) => {
                if (count === lons.length) {
                    const grown = new Float64Array(lons.length * 2);
                    grown.set(lons);
                    lons = grown;
                }
                lons[count++] = lon;
                return true;
            });
        }
        lonRange = getMinimalLongitudeRange(lons, count);
    }

    if (!lonRange || minLat === Infinity || maxLat === -Infinity) {
        return null; // No valid data found
    }
    return { minLon: lonRange.minLon, minLat, maxLon: lonRange.maxLon, maxLat };
}


const isValidLatLon = (lat: number, lon: number): boolean =>
    !(isNaN(lat) || !isFinite(lat) || lat < -90 || lat > 90) &&
    !(isNaN(lon) || !isFinite(lon) || lon < -180 || lon > 180);

export function validateData(data: OurData): boolean {
    return visitLatLons(data, isValidLatLon);
}
