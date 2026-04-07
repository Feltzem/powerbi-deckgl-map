export type RGBAColor = [number, number, number, number];

const clampColorChannel = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(value)));

export function decodeHex(
  hex: string | null | undefined,
  defaultColor: RGBAColor,
): RGBAColor {
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
  return [
    parseInt(hex.substring(1, 3), 16),
    parseInt(hex.substring(3, 5), 16),
    parseInt(hex.substring(5, 7), 16),
    parseInt(hex.substring(7, 9), 16),
  ];
}

export function withOpacity(col: RGBAColor, opacity: number): RGBAColor {
  return [col[0], col[1], col[2], opacity];
}

export function withScaledOpacity(col: RGBAColor, scale: number): RGBAColor {
  return [col[0], col[1], col[2], Math.round(col[3] * scale)];
}

export function interpolateColor(
  fromColor: RGBAColor,
  toColor: RGBAColor,
  factor: number,
): RGBAColor {
  const t = Math.max(0, Math.min(1, factor));
  return [
    clampColorChannel(fromColor[0] + (toColor[0] - fromColor[0]) * t),
    clampColorChannel(fromColor[1] + (toColor[1] - fromColor[1]) * t),
    clampColorChannel(fromColor[2] + (toColor[2] - fromColor[2]) * t),
    clampColorChannel(fromColor[3] + (toColor[3] - fromColor[3]) * t),
  ];
}

export function interpolateGradientColor(
  value: number,
  minValue: number,
  maxValue: number,
  lowColor: RGBAColor,
  highColor: RGBAColor,
  middleColor?: RGBAColor | null,
): RGBAColor {
  if (
    !Number.isFinite(minValue) ||
    !Number.isFinite(maxValue) ||
    maxValue <= minValue
  ) {
    return middleColor ?? interpolateColor(lowColor, highColor, 0.5);
  }

  const normalized = Math.max(
    0,
    Math.min(1, (value - minValue) / (maxValue - minValue)),
  );
  if (!middleColor) {
    return interpolateColor(lowColor, highColor, normalized);
  }

  if (normalized <= 0.5) {
    return interpolateColor(lowColor, middleColor, normalized * 2);
  }

  return interpolateColor(middleColor, highColor, (normalized - 0.5) * 2);
}
