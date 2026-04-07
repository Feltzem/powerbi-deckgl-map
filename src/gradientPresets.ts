import { decodeHex, RGBAColor, withOpacity } from "./col";

export interface GradientPresetDefinition {
  displayName: string;
  start: string;
  middle?: string;
  end: string;
  hasMiddle: boolean;
}

export interface ResolvedGradientColors {
  lowColor: RGBAColor;
  middleColor: RGBAColor | null;
  highColor: RGBAColor;
}

export const gradientPresets = {
  magma: {
    displayName: "Magma",
    start: "#000004",
    middle: "#b53679",
    end: "#fcfdbf",
    hasMiddle: true,
  },
  viridis: {
    displayName: "Viridis",
    start: "#440154",
    middle: "#21908c",
    end: "#fde725",
    hasMiddle: true,
  },
  "white-dark-red": {
    displayName: "White to dark red",
    start: "#ffffff",
    end: "#BA1717",
    hasMiddle: false,
  },
  "white-black": {
    displayName: "White to black",
    start: "#ffffff",
    end: "#000000",
    hasMiddle: false,
  },
  "white-dark-blue": {
    displayName: "White to dark blue",
    start: "#ffffff",
    end: "#08306b",
    hasMiddle: false,
  },
  "black-dark-red": {
    displayName: "Black to dark red",
    start: "#000000",
    end: "#BA1717",
    hasMiddle: false,
  },
  "black-white": {
    displayName: "Black to white",
    start: "#000000",
    end: "#ffffff",
    hasMiddle: false,
  },
  "black-dark-blue": {
    displayName: "Black to dark blue",
    start: "#000000",
    end: "#08306b",
    hasMiddle: false,
  },
} as const satisfies Record<string, GradientPresetDefinition>;

export type GradientPresetKey = keyof typeof gradientPresets;

export const defaultGradientPresetKey: GradientPresetKey = "magma";

const gradientPresetEntries = Object.entries(gradientPresets) as Array<
  [GradientPresetKey, (typeof gradientPresets)[GradientPresetKey]]
>;

export const gradientPresetItems = gradientPresetEntries.map(
  ([value, preset]) => ({
    value,
    displayName: preset.displayName,
  }),
);

const fallbackLowColor: RGBAColor = decodeHex(
  gradientPresets[defaultGradientPresetKey].start,
  [0, 0, 0, 255],
);
const fallbackMiddleColor: RGBAColor = decodeHex(
  gradientPresets[defaultGradientPresetKey].middle ??
    gradientPresets[defaultGradientPresetKey].end,
  fallbackLowColor,
);
const fallbackHighColor: RGBAColor = decodeHex(
  gradientPresets[defaultGradientPresetKey].end,
  fallbackLowColor,
);

export const getGradientPreset = (
  presetKey: string | null | undefined,
): GradientPresetDefinition => {
  if (presetKey && presetKey in gradientPresets) {
    return gradientPresets[presetKey as GradientPresetKey];
  }

  return gradientPresets[defaultGradientPresetKey];
};

export const resolveGradientPresetColors = (
  presetKey: string | null | undefined,
  opacity: number,
): ResolvedGradientColors => {
  const preset = getGradientPreset(presetKey);

  return {
    lowColor: withOpacity(decodeHex(preset.start, fallbackLowColor), opacity),
    middleColor:
      preset.hasMiddle && preset.middle
        ? withOpacity(decodeHex(preset.middle, fallbackMiddleColor), opacity)
        : null,
    highColor: withOpacity(decodeHex(preset.end, fallbackHighColor), opacity),
  };
};
