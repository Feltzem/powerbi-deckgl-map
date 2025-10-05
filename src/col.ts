export function decodeHex(hex: string | null | undefined, defaultColor: [number, number, number, number]): [number, number, number, number] {
    if (!hex) {
        return defaultColor;
    }

    if (typeof hex !== "string" || hex[0] !== "#") {
        return defaultColor;
    }
    if (hex.length == 5) {
        hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3] + "FF";
    } else if (hex.length == 7) {
        hex = hex + "FF";
    }
    if (hex.length != 9) {
        return defaultColor;
    }
    return [parseInt(hex.substring(1, 3), 16), parseInt(hex.substring(3, 5), 16), parseInt(hex.substring(5, 7), 16), parseInt(hex.substring(7, 9), 16)];
}

export function withOpacity(col: [number, number, number, number], opacity: number): [number, number, number, number] {
    return [col[0], col[1], col[2], opacity];
}