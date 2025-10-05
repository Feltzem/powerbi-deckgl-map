export function decodeFloats(encoded: string, precisions: number[], checkLonLat: boolean = false): number[][] {
    // https://github.com/mapbox/polyline/blob/master/src/polyline.js
    var index = 0,
        out: number[][] = [],
        shift = 0,
        result = 0,
        byte: number | null = null,
        factors = precisions.map(d => Math.pow(10, d)),
        values = precisions.map(d => 0);

    while (index < encoded.length) {
        byte = null;
        factors.forEach((f, i) => {
            shift = result = 0;
            do {
                byte = encoded.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);
            values[i] += ((result & 1) ? ~(result >> 1) : (result >> 1));
        })
        const d = values.map((d, i) => d / factors[i]);
        if (checkLonLat) {
            var lon = d[0];
            if (isNaN(lon) || lon < -180 || lon > 180) {
                console.log("Invalid lon", lon);
                continue;
            }
            var lat = d[1];
            if (isNaN(lat) || lat < -90 || lat > 90) {
                console.log("Invalid lat", lat);
                continue;
            }
        }
        out.push(d);
    }
    return out;
};


export function decodeFloatsWithCache(id: string, decodeCache, encoded: string, precisions: number[], checkLonLat: boolean = false): number[][] {
    const key = id + '-' + precisions.toString();
    if (!decodeCache.hasOwnProperty(key)) {
        decodeCache[key] = decodeFloats(encoded, precisions, checkLonLat);
    }
    return decodeCache[key];
}