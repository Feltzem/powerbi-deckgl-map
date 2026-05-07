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

export function parseColorString(
  value: string | null | undefined,
): RGBAColor | null {
  if (!value || typeof value !== "string") {
    return null;
  }

  const color = value.trim().replace(/^(['"])(.*)\1$/, "$2");
  if (!color) {
    return null;
  }

  const rgbFunctionColor = parseRgbFunction(color);
  if (rgbFunctionColor) {
    return rgbFunctionColor;
  }

  if (!/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) {
    return null;
  }

  let normalized = color;
  if (normalized.length === 4 || normalized.length === 5) {
    const alpha = normalized.length === 5 ? normalized[4] + normalized[4] : "FF";
    normalized =
      "#" +
      normalized[1] +
      normalized[1] +
      normalized[2] +
      normalized[2] +
      normalized[3] +
      normalized[3] +
      alpha;
  } else if (normalized.length === 7) {
    normalized += "FF";
  }

  return [
    parseInt(normalized.substring(1, 3), 16),
    parseInt(normalized.substring(3, 5), 16),
    parseInt(normalized.substring(5, 7), 16),
    parseInt(normalized.substring(7, 9), 16),
  ];
}

export function decodeHex(
  hex: string | null | undefined,
  defaultColor: RGBAColor,
): RGBAColor {
  return parseColorString(hex) ?? defaultColor;
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
