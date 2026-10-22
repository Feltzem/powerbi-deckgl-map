import { BoundingBox, OurData } from './dataTypes';

function getMinimalLongitudeRange(lons: number[]): { minLon: number; maxLon: number } | null {
    if (lons.length === 0) {
        return null;
    }

    const normalized = lons
        .filter((lon) => Number.isFinite(lon))
        .map((lon) => (lon < 0 ? lon + 360 : lon))
        .sort((a, b) => a - b);

    if (normalized.length === 0) {
        return null;
    }

    if (normalized.length === 1) {
        const lon = normalized[0] > 180 ? normalized[0] - 360 : normalized[0];
        return { minLon: lon, maxLon: lon };
    }

    let largestGap = -1;
    let gapIndex = -1;
    for (let i = 0; i < normalized.length; i++) {
        const current = normalized[i];
        const next = i === normalized.length - 1 ? normalized[0] + 360 : normalized[i + 1];
        const gap = next - current;
        if (gap > largestGap) {
            largestGap = gap;
            gapIndex = i;
        }
    }

    const rangeStart = gapIndex === normalized.length - 1 ? normalized[0] : normalized[gapIndex + 1];
    let rangeEnd = normalized[gapIndex];
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


// getMinimalLongitudeRange sorts every longitude to find the widest gap. When
// the wrap-around gap is wider than the whole span, no interior gap can beat
// it (floating-point subtraction is monotonic), so the range is simply the
// first minimum and last maximum, which is what the stable sort would return.
// Wider data falls back to the sort.
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
        const lons: number[] = [];
        for (const d of data) {
            visitLatLons(d, (_lat, lon) => {
                lons.push(lon);
                return true;
            });
        }
        lonRange = getMinimalLongitudeRange(lons);
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
