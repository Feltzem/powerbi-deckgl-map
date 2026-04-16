export type RGBAColor = [number, number, number, number];

const clampColorChannel = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(value)));

const rgbaFunctionPattern = /^rgba?\((.*)\)$/i;

const parseCssAlpha = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.endsWith("%")) {
    const percentage = Number(trimmed.slice(0, -1));
    if (!Number.isFinite(percentage)) {
      return null;
    }
    return clampColorChannel((percentage / 100) * 255);
  }

  const numericValue = Number(trimmed);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  if (numericValue >= 0 && numericValue <= 1) {
    return clampColorChannel(numericValue * 255);
  }
  return clampColorChannel(numericValue);
};

const parseCssRgbChannel = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.endsWith("%")) {
    const percentage = Number(trimmed.slice(0, -1));
    if (!Number.isFinite(percentage)) {
      return null;
    }
    return clampColorChannel((percentage / 100) * 255);
  }

  const numericValue = Number(trimmed);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  return clampColorChannel(numericValue);
};

const parseRgbFunction = (value: string): RGBAColor | null => {
  const match = value.trim().match(rgbaFunctionPattern);
  if (!match) {
    return null;
  }

  const body = match[1].trim();
  if (!body) {
    return null;
  }

  const hasSlashAlpha = body.includes("/");
  let components: string[];
  let alphaComponent: string | undefined;

  if (hasSlashAlpha) {
    const parts = body.split("/");
    if (parts.length !== 2) {
      return null;
    }
    components = parts[0]
      .trim()
      .split(/[\s,]+/)
      .filter((component) => component.length > 0);
    alphaComponent = parts[1].trim();
  } else {
    components = body
      .split(",")
      .map((component) => component.trim())
      .filter((component) => component.length > 0);

    if (components.length === 1) {
      components = body
        .split(/\s+/)
        .map((component) => component.trim())
        .filter((component) => component.length > 0);
    }

    if (components.length === 4) {
      alphaComponent = components[3];
      components = components.slice(0, 3);
    }
  }

  if (components.length !== 3) {
    return null;
  }

  const rgb = components.map(parseCssRgbChannel);
  if (rgb.some((channel) => channel === null)) {
    return null;
  }

  const alpha =
    alphaComponent === undefined ? 255 : parseCssAlpha(alphaComponent);
  if (alpha === null) {
    return null;
  }

  return [rgb[0]!, rgb[1]!, rgb[2]!, alpha];
};

export function decodeHex(
  hex: string | null | undefined,
  defaultColor: RGBAColor,
): RGBAColor {
  if (!hex) {
    return defaultColor;
  }

  if (typeof hex !== "string") {
    return defaultColor;
  }
  const rgbFunctionColor = parseRgbFunction(hex);
  if (rgbFunctionColor) {
    return rgbFunctionColor;
  }
  if (hex[0] !== "#") {
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
  return [col[0], col[1], col[2], clampColorChannel(opacity)];
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
