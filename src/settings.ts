"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import {
  defaultGradientBinningMethod,
  defaultGradientClassCount,
  defaultGradientDefinedInterval,
  defaultGradientManualBreaks,
  defaultGradientManualColors,
  GradientBinningMethod,
  getGradientBinningMethodDisplayName,
  gradientBinningMethodItems,
} from "./gradientClassification";
import {
  defaultGradientPresetKey,
  getGradientPreset,
  GradientPresetKey,
  gradientPresetItems,
} from "./gradientPresets";
import {
  categoricalPaletteItems,
  defaultCategoricalPaletteKey,
  getCategoricalPalette,
  CategoricalPaletteKey,
} from "./categoricalPalettes";
import { DEFAULT_LAYER_DRAW_ORDER } from "./layerState";
import {
  defaultScatterSymbolType,
  getScatterSymbol,
  scatterSymbolItems,
} from "./scatterSymbols";
import {
  basemapOptions,
  DEFAULT_BASEMAP_ID,
  isAerialBasemap,
  isMapboxSatelliteBasemap,
  resolveBasemap,
} from "./basemaps";
import { DEFAULT_3D_BUILDINGS_MIN_ZOOM } from "./buildings";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

/** Animation speed-mode dropdown items. The first entry is the default. */
export const ANIMATION_SPEED_MODE_DURATION = "duration";
export const ANIMATION_SPEED_MODE_MULTIPLIER = "multiplier";
export const ANIMATION_SPEED_MODE_ITEMS = [
  { value: ANIMATION_SPEED_MODE_DURATION, displayName: "Duration (seconds)" },
  {
    value: ANIMATION_SPEED_MODE_MULTIPLIER,
    displayName: "Multiplier (sim sec / real sec)",
  },
];

export class BaseBillboardSettings extends FormattingSettingsCard {
  billboard = new formattingSettings.ToggleSwitch({
    name: "billboard",
    displayName: "Billboard",
    description: "Whether to face camera or lay flat",
    value: false,
  });

  slices: Array<FormattingSettingsSlice> = [this.billboard];
}
export class HighlightingCardSettings extends FormattingSettingsCard {
  highlightOnClick = new formattingSettings.ToggleSwitch({
    name: "highlightOnClick",
    displayName: "Highlight on click?",
    description: "Whether clicked/selected objects are highlighted",
    value: true,
  });

  highlightSizeScale = new formattingSettings.NumUpDown({
    name: "highlightSizeScale",
    displayName: "Highlight size scale",
    description: "Scale factor for point/line size when highlighted",
    value: 3,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 1,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 100,
      },
    },
  });

  highlightColor = new formattingSettings.ColorPicker({
    name: "highlightColor",
    displayName: "Highlight color",
    description: "Color used for selected objects",
    value: { value: "#ff0000" },
  });

  highlightOpacity = new formattingSettings.Slider({
    name: "highlightOpacity",
    displayName: "Highlight opacity",
    description: "Opacity used for selected objects",
    value: 100,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 255,
      },
    },
  });

  unselectedFadeOpacity = new formattingSettings.Slider({
    name: "unselectedFadeOpacity",
    displayName: "Unselected fade factor (0-100%)",
    description:
      "Percentage multiplier applied to unselected polygon opacity when a polygon is selected",
    value: 50,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 100,
      },
    },
  });

  autoHighlight = new formattingSettings.ToggleSwitch({
    name: "autoHighlight",
    displayName: "Highlight on hover?",
    description: "Whether hovered objects are automatically highlighted",
    value: true,
  });

  autoHighlightColor = new formattingSettings.ColorPicker({
    name: "autoHighlightColor",
    displayName: "Highlight color on hover",
    description: "Color of highlighted points/lines",
    value: { value: "#ff9900" },
  });

  autoHighlightOpacity = new formattingSettings.Slider({
    name: "autoHighlightOpacity",
    displayName: "Highlight opacity on hover",
    description: "Opacity of highlighted points/lines (0-255)",
    value: 100,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 255,
      },
    },
  });

  slices: Array<FormattingSettingsSlice> = [
    this.highlightOnClick,
    this.autoHighlight,
    this.unselectedFadeOpacity,
    this.autoHighlightColor,
    this.autoHighlightOpacity,
  ];

  name: string = "highlightingProps";
  displayName: string = "Highlighting";
}

export class BaseStrokeWidthSettings extends FormattingSettingsCard {
  lineWidthMinPixels = new formattingSettings.NumUpDown({
    name: "lineWidthMinPixels",
    displayName: "Line width min (pixels)",
    description: "Minimum width that a line will show as (in pixels)",
    value: 2,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 100,
      },
    },
  });

  lineWidthMaxPixels = new formattingSettings.NumUpDown({
    name: "lineWidthMaxPixels",
    displayName: "Line width max (pixels)",
    description: "Maximum width that a line will show as (in pixels)",
    value: 1000,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 1000,
      },
    },
  });

  defaultLineWidth = new formattingSettings.NumUpDown({
    name: "defaultLineWidth",
    displayName: "Default line width (m)",
    description: "Default width for lines if not specified in data",
    value: 1,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 1000,
      },
    },
  });

  slices: Array<FormattingSettingsSlice> = [
    this.lineWidthMinPixels,
    this.lineWidthMaxPixels,
    this.defaultLineWidth,
  ];
}
export class BaseStrokeColorSettings extends FormattingSettingsCard {
  defaultLineColor = new formattingSettings.ColorPicker({
    name: "defaultLineColor",
    displayName: "Default line color",
    description: "Default color for lines if not specified in data",
    value: { value: "#000000" },
  });

  defaultLineOpacity = new formattingSettings.Slider({
    name: "defaultLineOpacity",
    displayName: "Default line opacity",
    description: "Default opacity for lines if not specified in data",
    value: 100,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 255,
      },
    },
  });

  slices: Array<FormattingSettingsSlice> = [
    this.defaultLineColor,
    this.defaultLineOpacity,
  ];
}

export class BaseStrokeSettings extends FormattingSettingsCard {
  width = new BaseStrokeWidthSettings();
  color = new BaseStrokeColorSettings();
  slices: Array<FormattingSettingsSlice> = [
    ...this.width.slices,
    ...this.color.slices,
  ];
}
export class BaseFillSettings extends FormattingSettingsCard {
  defaultFillColor = new formattingSettings.ColorPicker({
    name: "defaultFillColor",
    displayName: "Default fill color",
    description: "Default color for fills if not specified in data",
    value: { value: "#000000" },
  });

  defaultFillOpacity = new formattingSettings.Slider({
    name: "defaultFillOpacity",
    displayName: "Default fill opacity",
    description: "Default opacity for fills if not specified in data",
    value: 100,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 255,
      },
    },
  });

  slices: Array<FormattingSettingsSlice> = [
    this.defaultFillColor,
    this.defaultFillOpacity,
  ];
}

interface NumericGradientSettingsOptions {
  presetName: string;
  binningMethodName: string;
  classCountName: string;
  definedIntervalName: string;
  manualBreaksName: string;
  manualColorsName: string;
  fieldLabel: string;
  displayPrefix?: string;
  defaultPreset?: GradientPresetKey;
  defaultBinningMethod?: GradientBinningMethod;
  defaultClassCount?: number;
  defaultDefinedInterval?: number;
  defaultManualBreaks?: string;
  defaultManualColors?: string;
}

export class NumericGradientSettings extends FormattingSettingsCard {
  preset: formattingSettings.ItemDropdown;
  binningMethod: formattingSettings.ItemDropdown;
  classCount: formattingSettings.NumUpDown;
  definedInterval: formattingSettings.NumUpDown;
  manualBreaks: formattingSettings.TextInput;
  manualColors: formattingSettings.TextInput;
  slices: Array<FormattingSettingsSlice> = [];

  constructor(options: NumericGradientSettingsOptions) {
    super();

    const displayPrefix = options.displayPrefix
      ? `${options.displayPrefix} `
      : "";
    const presetKey = options.defaultPreset ?? defaultGradientPresetKey;
    const preset = getGradientPreset(presetKey);
    const binningMethod =
      options.defaultBinningMethod ?? defaultGradientBinningMethod;

    this.preset = new formattingSettings.ItemDropdown({
      name: options.presetName,
      displayName: `${displayPrefix}Gradient scale`,
      description: `Preset color scale used for numeric ${options.fieldLabel} values`,
      value: { value: presetKey, displayName: preset.displayName },
      items: gradientPresetItems,
    });

    this.binningMethod = new formattingSettings.ItemDropdown({
      name: options.binningMethodName,
      displayName: `${displayPrefix}Classification method`,
      description: `How numeric ${options.fieldLabel} values are grouped into color classes`,
      value: {
        value: binningMethod,
        displayName: getGradientBinningMethodDisplayName(binningMethod),
      },
      items: gradientBinningMethodItems,
    });

    this.classCount = new formattingSettings.NumUpDown({
      name: options.classCountName,
      displayName: `${displayPrefix}Class count`,
      description:
        "Number of classes used for natural breaks, quantile, and equal interval classification",
      value: options.defaultClassCount ?? defaultGradientClassCount,
      options: {
        minValue: {
          type: powerbi.visuals.ValidatorType.Min,
          value: 2,
        },
        maxValue: {
          type: powerbi.visuals.ValidatorType.Max,
          value: 12,
        },
      },
    });

    this.definedInterval = new formattingSettings.NumUpDown({
      name: options.definedIntervalName,
      displayName: `${displayPrefix}Defined interval`,
      description:
        "Interval size used when the classification method is set to defined interval",
      value: options.defaultDefinedInterval ?? defaultGradientDefinedInterval,
      options: {
        minValue: {
          type: powerbi.visuals.ValidatorType.Min,
          value: 0.000001,
        },
        maxValue: {
          type: powerbi.visuals.ValidatorType.Max,
          value: 1000000000,
        },
      },
    });

    this.manualBreaks = new formattingSettings.TextInput({
      name: options.manualBreaksName,
      displayName: `${displayPrefix}Manual interval breaks`,
      description:
        "Comma-separated break values for manual interval classification (e.g. 0,10,50,100). Used when classification method is set to manual interval.",
      value: options.defaultManualBreaks ?? defaultGradientManualBreaks,
      placeholder: "e.g. 0, 10, 50, 100, 500",
    });

    this.manualColors = new formattingSettings.TextInput({
      name: options.manualColorsName,
      displayName: `${displayPrefix}Manual interval colours`,
      description:
        "Comma-separated hex colours for each manual interval class (e.g. #ff0000, #ffaa00, #00cc00). One colour per class; extras are ignored, missing classes repeat the last colour. Used when classification method is set to manual interval.",
      value: options.defaultManualColors ?? defaultGradientManualColors,
      placeholder: "e.g. #ff0000, #ffaa00, #00cc00",
    });

    this.slices = [
      this.preset,
      this.binningMethod,
      this.classCount,
      this.definedInterval,
      this.manualBreaks,
      this.manualColors,
    ];
  }

  /**
   * Show only the inputs that apply to the currently-selected classification
   * method. Call this after the formatting model has been populated from the
   * data view, so it reflects the user's persisted selection rather than the
   * constructor default.
   */
  applyMethodVisibility(): void {
    const method = this.binningMethod.value?.value as
      | GradientBinningMethod
      | undefined;
    const usesClassCount =
      method === "natural-breaks" ||
      method === "quantile" ||
      method === "equal-interval";
    this.classCount.visible = usesClassCount;
    this.definedInterval.visible = method === "defined-interval";
    this.manualBreaks.visible = method === "manual-interval";
    this.manualColors.visible = method === "manual-interval";
  }
}

interface CategoricalPaletteSettingsOptions {
  paletteName: string;
  fieldLabel: string;
  displayPrefix?: string;
  defaultPalette?: CategoricalPaletteKey;
}

export class CategoricalPaletteSettings extends FormattingSettingsCard {
  palette: formattingSettings.ItemDropdown;
  slices: Array<FormattingSettingsSlice> = [];

  constructor(options: CategoricalPaletteSettingsOptions) {
    super();

    const displayPrefix = options.displayPrefix
      ? `${options.displayPrefix} `
      : "";
    const paletteKey = options.defaultPalette ?? defaultCategoricalPaletteKey;
    const palette = getCategoricalPalette(paletteKey);

    this.palette = new formattingSettings.ItemDropdown({
      name: options.paletteName,
      displayName: `${displayPrefix}Categorical palette`,
      description: `Palette used for categorical ${options.fieldLabel} text values`,
      value: { value: paletteKey, displayName: palette.displayName },
      items: categoricalPaletteItems,
    });

    this.slices = [this.palette];
  }
}

export const LABEL_PLACEMENT_ITEMS = [
  { value: "top-left", displayName: "Top left" },
  { value: "top-center", displayName: "Top center" },
  { value: "top-right", displayName: "Top right" },
  { value: "middle-left", displayName: "Middle left" },
  { value: "middle-center", displayName: "Middle center" },
  { value: "middle-right", displayName: "Middle right" },
  { value: "bottom-left", displayName: "Bottom left" },
  { value: "bottom-center", displayName: "Bottom center" },
  { value: "bottom-right", displayName: "Bottom right" },
] as const;

export type LabelPlacement = (typeof LABEL_PLACEMENT_ITEMS)[number]["value"];

export const LABEL_BOX_SHAPE_ITEMS = [
  { value: "rectangle", displayName: "Rectangle" },
  { value: "rounded", displayName: "Rounded" },
  { value: "pill", displayName: "Pill" },
] as const;

export type LabelBoxShape = (typeof LABEL_BOX_SHAPE_ITEMS)[number]["value"];

const labelNumberOptions = (
  minValue: number,
  maxValue?: number,
): formattingSettings.NumUpDown["options"] => ({
  minValue: {
    type: powerbi.visuals.ValidatorType.Min,
    value: minValue,
  },
  ...(maxValue === undefined
    ? {}
    : {
        maxValue: {
          type: powerbi.visuals.ValidatorType.Max,
          value: maxValue,
        },
      }),
});

export class LabelCardSettings extends FormattingSettingsCard {
  showLabels = new formattingSettings.ToggleSwitch({
    name: "showLabels",
    displayName: "Show labels",
    description: "Render labels for features with a non-blank Feature label",
    value: false,
  });

  minZoom = new formattingSettings.NumUpDown({
    name: "minZoom",
    displayName: "Minimum zoom",
    description: "Minimum map zoom at which labels are visible",
    value: 0,
    options: labelNumberOptions(0, 24),
  });

  maxZoom = new formattingSettings.NumUpDown({
    name: "maxZoom",
    displayName: "Maximum zoom",
    description: "Maximum map zoom at which labels are visible",
    value: 24,
    options: labelNumberOptions(0, 24),
  });

  font = new formattingSettings.FontControl({
    name: "font",
    displayName: "Font",
    description: "Font used for feature labels",
    fontFamily: new formattingSettings.FontPicker({
      name: "fontFamily",
      displayName: "Font family",
      value: "Segoe UI",
    }),
    fontSize: new formattingSettings.NumUpDown({
      name: "fontSize",
      displayName: "Font size",
      value: 12,
      options: labelNumberOptions(1, 256),
    }),
    bold: new formattingSettings.ToggleSwitch({
      name: "fontBold",
      displayName: "Bold",
      value: false,
    }),
    italic: new formattingSettings.ToggleSwitch({
      name: "fontItalic",
      displayName: "Italic",
      value: false,
    }),
  });

  textColor = new formattingSettings.ColorPicker({
    name: "textColor",
    displayName: "Text color",
    value: { value: "#000000" },
  });

  textOpacity = new formattingSettings.Slider({
    name: "textOpacity",
    displayName: "Text opacity",
    value: 255,
    options: {
      minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
      maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 255 },
    },
  });

  placement = new formattingSettings.ItemDropdown({
    name: "placement",
    displayName: "Placement",
    value: LABEL_PLACEMENT_ITEMS[4],
    items: [...LABEL_PLACEMENT_ITEMS],
  });

  offsetX = new formattingSettings.NumUpDown({
    name: "offsetX",
    displayName: "X offset (pixels)",
    value: 0,
    options: labelNumberOptions(-500, 500),
  });

  offsetY = new formattingSettings.NumUpDown({
    name: "offsetY",
    displayName: "Y offset (pixels)",
    value: 0,
    options: labelNumberOptions(-500, 500),
  });

  showBox = new formattingSettings.ToggleSwitch({
    name: "showBox",
    displayName: "Show background box",
    value: true,
  });

  boxFillColor = new formattingSettings.ColorPicker({
    name: "boxFillColor",
    displayName: "Box fill color",
    value: { value: "#ffffff" },
  });

  boxFillOpacity = new formattingSettings.Slider({
    name: "boxFillOpacity",
    displayName: "Box fill opacity",
    value: 255,
    options: {
      minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
      maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 255 },
    },
  });

  boxShape = new formattingSettings.ItemDropdown({
    name: "boxShape",
    displayName: "Box shape",
    value: LABEL_BOX_SHAPE_ITEMS[1],
    items: [...LABEL_BOX_SHAPE_ITEMS],
  });

  boxPadding = new formattingSettings.NumUpDown({
    name: "boxPadding",
    displayName: "Box padding (pixels)",
    value: 4,
    options: labelNumberOptions(0, 100),
  });

  borderColor = new formattingSettings.ColorPicker({
    name: "borderColor",
    displayName: "Box border color",
    value: { value: "#000000" },
  });

  borderOpacity = new formattingSettings.Slider({
    name: "borderOpacity",
    displayName: "Box border opacity",
    value: 255,
    options: {
      minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
      maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 255 },
    },
  });

  borderWidth = new formattingSettings.NumUpDown({
    name: "borderWidth",
    displayName: "Box border width (pixels)",
    value: 1,
    options: labelNumberOptions(0, 20),
  });

  showShadow = new formattingSettings.ToggleSwitch({
    name: "showShadow",
    displayName: "Show shadow",
    value: false,
  });

  shadowColor = new formattingSettings.ColorPicker({
    name: "shadowColor",
    displayName: "Shadow color",
    value: { value: "#000000" },
  });

  shadowOpacity = new formattingSettings.Slider({
    name: "shadowOpacity",
    displayName: "Shadow opacity",
    value: 120,
    options: {
      minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
      maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 255 },
    },
  });

  shadowBlur = new formattingSettings.NumUpDown({
    name: "shadowBlur",
    displayName: "Shadow blur (pixels)",
    value: 3,
    options: labelNumberOptions(0, 50),
  });

  shadowOffsetX = new formattingSettings.NumUpDown({
    name: "shadowOffsetX",
    displayName: "Shadow X offset (pixels)",
    value: 2,
    options: labelNumberOptions(-100, 100),
  });

  shadowOffsetY = new formattingSettings.NumUpDown({
    name: "shadowOffsetY",
    displayName: "Shadow Y offset (pixels)",
    value: 2,
    options: labelNumberOptions(-100, 100),
  });

  showGlow = new formattingSettings.ToggleSwitch({
    name: "showGlow",
    displayName: "Show glow",
    value: false,
  });

  glowColor = new formattingSettings.ColorPicker({
    name: "glowColor",
    displayName: "Glow color",
    value: { value: "#ffffff" },
  });

  glowOpacity = new formattingSettings.Slider({
    name: "glowOpacity",
    displayName: "Glow opacity",
    value: 160,
    options: {
      minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
      maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 255 },
    },
  });

  glowWidth = new formattingSettings.NumUpDown({
    name: "glowWidth",
    displayName: "Glow width (pixels)",
    value: 2,
    options: labelNumberOptions(0, 50),
  });

  collisionPadding = new formattingSettings.NumUpDown({
    name: "collisionPadding",
    displayName: "Collision padding (pixels)",
    value: 2,
    options: labelNumberOptions(0, 100),
  });

  name: string = "labelProps";
  displayName: string = "Feature labels";
  topLevelSlice = this.showLabels;
  slices: Array<FormattingSettingsSlice> = [
    this.minZoom,
    this.maxZoom,
    this.font,
    this.textColor,
    this.textOpacity,
    this.placement,
    this.offsetX,
    this.offsetY,
    this.showBox,
    this.boxFillColor,
    this.boxFillOpacity,
    this.boxShape,
    this.boxPadding,
    this.borderColor,
    this.borderOpacity,
    this.borderWidth,
    this.showShadow,
    this.shadowColor,
    this.shadowOpacity,
    this.shadowBlur,
    this.shadowOffsetX,
    this.shadowOffsetY,
    this.showGlow,
    this.glowColor,
    this.glowOpacity,
    this.glowWidth,
    this.collisionPadding,
  ];

  applyConditionalVisibility(): void {
    const labelsVisible = this.showLabels.value === true;
    const setVisible = (
      slices: Array<FormattingSettingsSlice>,
      visible: boolean,
    ): void => {
      for (const slice of slices) {
        slice.visible = visible;
      }
    };

    setVisible(
      [
        this.minZoom,
        this.maxZoom,
        this.font,
        this.textColor,
        this.textOpacity,
        this.placement,
        this.offsetX,
        this.offsetY,
        this.showBox,
        this.showShadow,
        this.showGlow,
        this.collisionPadding,
      ],
      labelsVisible,
    );
    setVisible(
      [
        this.boxFillColor,
        this.boxFillOpacity,
        this.boxShape,
        this.boxPadding,
        this.borderColor,
        this.borderOpacity,
        this.borderWidth,
      ],
      labelsVisible && this.showBox.value === true,
    );
    setVisible(
      [
        this.shadowColor,
        this.shadowOpacity,
        this.shadowBlur,
        this.shadowOffsetX,
        this.shadowOffsetY,
      ],
      labelsVisible && this.showShadow.value === true,
    );
    setVisible(
      [this.glowColor, this.glowOpacity, this.glowWidth],
      labelsVisible && this.showGlow.value === true,
    );
  }
}

export class ScatterCardSettings extends FormattingSettingsCard {
  billboard = new BaseBillboardSettings();
  line = new BaseStrokeSettings();
  fill = new BaseFillSettings();
  lineGradient = new NumericGradientSettings({
    presetName: "lineGradientPreset",
    binningMethodName: "lineGradientBinningMethod",
    classCountName: "lineGradientClassCount",
    definedIntervalName: "lineGradientDefinedInterval",
    manualBreaksName: "lineGradientManualBreaks",
    manualColorsName: "lineGradientManualColors",
    fieldLabel: "scatter line color",
    displayPrefix: "Line",
  });
  fillGradient = new NumericGradientSettings({
    presetName: "fillGradientPreset",
    binningMethodName: "fillGradientBinningMethod",
    classCountName: "fillGradientClassCount",
    definedIntervalName: "fillGradientDefinedInterval",
    manualBreaksName: "fillGradientManualBreaks",
    manualColorsName: "fillGradientManualColors",
    fieldLabel: "scatter fill color",
    displayPrefix: "Fill",
  });
  lineCategoricalPalette = new CategoricalPaletteSettings({
    paletteName: "lineCategoricalPalette",
    fieldLabel: "scatter line color",
    displayPrefix: "Line",
  });
  fillCategoricalPalette = new CategoricalPaletteSettings({
    paletteName: "fillCategoricalPalette",
    fieldLabel: "scatter fill color",
    displayPrefix: "Fill",
  });

  layerType = new formattingSettings.TextInput({
    name: "layerType",
    displayName: "Layer Identifier",
    description:
      "If the layer type column is equal to this (case-insensitive) value, it will be treated as a scatter",
    value: "scatter",
    placeholder: "Enter layer type",
  });

  symbolType = new formattingSettings.ItemDropdown({
    name: "symbolType",
    displayName: "Symbol type",
    description: "Symbol shape used for scatter points",
    value: {
      value: defaultScatterSymbolType,
      displayName: getScatterSymbol(defaultScatterSymbolType).displayName,
    },
    items: scatterSymbolItems,
  });

  radiusMinPixels = new formattingSettings.NumUpDown({
    name: "radiusMinPixels",
    displayName: "Point radius min (pixels)",
    description: "Minimum radius that a point will show as (in pixels)",
    value: 2,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 100,
      },
    },
  });

  radiusMaxPixels = new formattingSettings.NumUpDown({
    name: "radiusMaxPixels",
    displayName: "Point radius max (pixels)",
    description: "Maximum radius that a point will show as (in pixels)",
    value: 1000,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 1000,
      },
    },
  });

  defaultRadius = new formattingSettings.NumUpDown({
    name: "defaultRadius",
    displayName: "Default radius (m)",
    description: "Default radius for circles if not specified in data",
    value: 1,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 1000,
      },
    },
  });

  stroked = new formattingSettings.ToggleSwitch({
    name: "stroked",
    displayName: "Stroked",
    description: "Whether to draw the outline of points/polygons",
    value: true,
  });

  filled = new formattingSettings.ToggleSwitch({
    name: "filled",
    displayName: "Filled",
    description: "Whether to fill points/polygons",
    value: true,
  });

  name: string = "scatterProps";
  displayName: string = "Scatter properties";
  slices: Array<FormattingSettingsSlice> = [
    this.layerType,
    this.symbolType,
    this.defaultRadius,
    this.radiusMinPixels,
    this.radiusMaxPixels,
    this.stroked,
    this.filled,
    ...this.fill.slices,
    ...this.fillGradient.slices,
    ...this.fillCategoricalPalette.slices,
    ...this.line.slices,
    ...this.lineGradient.slices,
    ...this.lineCategoricalPalette.slices,
    ...this.billboard.slices,
  ];
}

export class HeatmapCardSettings extends FormattingSettingsCard {
  showHeatmap = new formattingSettings.ToggleSwitch({
    name: "showHeatmap",
    displayName: "Show heatmap",
    description: "Render a heatmap derived from scatter points",
    value: false,
  });

  showScatterPoints = new formattingSettings.ToggleSwitch({
    name: "showScatterPoints",
    displayName: "Show scatter points",
    description: "Keep scatter points visible when the heatmap is enabled",
    value: true,
  });

  radiusPixels = new formattingSettings.NumUpDown({
    name: "radiusPixels",
    displayName: "Radius size (pixels)",
    description: "Heatmap radius in screen pixels",
    value: 50,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 1,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 100,
      },
    },
  });

  intensity = new formattingSettings.NumUpDown({
    name: "intensity",
    displayName: "Intensity",
    description: "Multiplier applied to aggregated heatmap weight",
    value: 1,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 100,
      },
    },
  });

  opacity = new formattingSettings.Slider({
    name: "opacity",
    displayName: "Opacity",
    description: "Opacity of heatmap colors (0-255)",
    value: 180,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 255,
      },
    },
  });

  colorPalette = new formattingSettings.ItemDropdown({
    name: "colorPalette",
    displayName: "Color palette",
    description: "Preset color palette for the heatmap",
    value: {
      value: defaultGradientPresetKey,
      displayName: getGradientPreset(defaultGradientPresetKey).displayName,
    },
    items: gradientPresetItems,
  });

  threshold = new formattingSettings.Slider({
    name: "threshold",
    displayName: "Low-density threshold (%)",
    description: "Hide pixels below this percentage of the strongest density",
    value: 5,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 100,
      },
    },
  });

  name: string = "heatmapProps";
  displayName: string = "Heatmap";
  topLevelSlice = this.showHeatmap;
  slices: Array<FormattingSettingsSlice> = [
    this.showScatterPoints,
    this.radiusPixels,
    this.intensity,
    this.opacity,
    this.colorPalette,
    this.threshold,
  ];
}

export class H3HexagonCardSettings extends FormattingSettingsCard {
  showH3Hexagons = new formattingSettings.ToggleSwitch({
    name: "showH3Hexagons",
    displayName: "Show H3 hexagons",
    description: "Render H3 hexagons derived from scatter points",
    value: false,
  });

  showScatterPoints = new formattingSettings.ToggleSwitch({
    name: "showScatterPoints",
    displayName: "Show scatter points",
    description: "Keep scatter points visible when H3 hexagons are enabled",
    value: true,
  });

  resolution = new formattingSettings.NumUpDown({
    name: "resolution",
    displayName: "H3 resolution",
    description:
      "H3 grid resolution, from 0 for largest cells to 15 for smallest cells",
    value: 7,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 15,
      },
    },
  });

  fillGradient = new NumericGradientSettings({
    presetName: "fillGradientPreset",
    binningMethodName: "fillGradientBinningMethod",
    classCountName: "fillGradientClassCount",
    definedIntervalName: "fillGradientDefinedInterval",
    manualBreaksName: "fillGradientManualBreaks",
    manualColorsName: "fillGradientManualColors",
    fieldLabel: "H3 fill point count",
    displayPrefix: "Fill",
  });

  lowFillOpacity = new formattingSettings.Slider({
    name: "lowFillOpacity",
    displayName: "Low-count opacity",
    description:
      "Fill and outline opacity for the lowest H3 point-count class (0-255)",
    value: 70,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 255,
      },
    },
  });

  highFillOpacity = new formattingSettings.Slider({
    name: "highFillOpacity",
    displayName: "High-count opacity",
    description:
      "Fill and outline opacity for the highest H3 point-count class (0-255)",
    value: 210,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 255,
      },
    },
  });

  lineWidth = new BaseStrokeWidthSettings();

  name: string = "h3HexagonProps";
  displayName: string = "H3 hexagon";
  topLevelSlice = this.showH3Hexagons;
  slices: Array<FormattingSettingsSlice> = [
    this.showScatterPoints,
    this.resolution,
    ...this.fillGradient.slices,
    this.lowFillOpacity,
    this.highFillOpacity,
    ...this.lineWidth.slices,
  ];
}

export class LineCardSettings extends FormattingSettingsCard {
  line = new BaseStrokeSettings();
  gradient = new NumericGradientSettings({
    presetName: "gradientPreset",
    binningMethodName: "gradientBinningMethod",
    classCountName: "gradientClassCount",
    definedIntervalName: "gradientDefinedInterval",
    manualBreaksName: "gradientManualBreaks",
    manualColorsName: "gradientManualColors",
    fieldLabel: "line color",
  });
  categoricalPalette = new CategoricalPaletteSettings({
    paletteName: "categoricalPalette",
    fieldLabel: "line color",
  });

  layerType = new formattingSettings.TextInput({
    name: "layerType",
    displayName: "Layer Identifier",
    description:
      "If the layer type column is equal to this (case-insensitive) value, it will be treated as a line",
    value: "line",
    placeholder: "Enter layer type",
  });

  name: string = "lineProps";
  displayName: string = "Line properties";
  slices: Array<FormattingSettingsSlice> = [
    this.layerType,
    ...this.line.slices,
    ...this.gradient.slices,
    ...this.categoricalPalette.slices,
  ];
}

export class ArcCardSettings extends FormattingSettingsCard {
  strokeWidth = new BaseStrokeWidthSettings();
  sourceGradient = new NumericGradientSettings({
    presetName: "sourceGradientPreset",
    binningMethodName: "sourceGradientBinningMethod",
    classCountName: "sourceGradientClassCount",
    definedIntervalName: "sourceGradientDefinedInterval",
    manualBreaksName: "sourceGradientManualBreaks",
    manualColorsName: "sourceGradientManualColors",
    fieldLabel: "arc source color",
    displayPrefix: "Source",
  });
  targetGradient = new NumericGradientSettings({
    presetName: "targetGradientPreset",
    binningMethodName: "targetGradientBinningMethod",
    classCountName: "targetGradientClassCount",
    definedIntervalName: "targetGradientDefinedInterval",
    manualBreaksName: "targetGradientManualBreaks",
    manualColorsName: "targetGradientManualColors",
    fieldLabel: "arc target color",
    displayPrefix: "Target",
  });
  sourceCategoricalPalette = new CategoricalPaletteSettings({
    paletteName: "sourceCategoricalPalette",
    fieldLabel: "arc source color",
    displayPrefix: "Source",
  });
  targetCategoricalPalette = new CategoricalPaletteSettings({
    paletteName: "targetCategoricalPalette",
    fieldLabel: "arc target color",
    displayPrefix: "Target",
  });

  layerType = new formattingSettings.TextInput({
    name: "layerType",
    displayName: "Layer Identifier",
    description:
      "If the layer type column is equal to this (case-insensitive) value, it will be treated as an arc",
    value: "arc",
    placeholder: "Enter layer type",
  });

  defaultSourceColor = new formattingSettings.ColorPicker({
    name: "defaultSourceColor",
    displayName: "Default source color",
    description: "Default color for arcs if not specified in data",
    value: { value: "#00ff00ff" },
  });

  defaultSourceOpacity = new formattingSettings.Slider({
    name: "defaultSourceOpacity",
    displayName: "Default source opacity",
    description: "Default opacity for source color if not specified in data",
    value: 100,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 255,
      },
    },
  });

  defaultTargetColor = new formattingSettings.ColorPicker({
    name: "defaultTargetColor",
    displayName: "Default target color",
    description: "Default color for arcs if not specified in data",
    value: { value: "#ff0000ff" },
  });

  defaultTargetOpacity = new formattingSettings.Slider({
    name: "defaultTargetOpacity",
    displayName: "Default target opacity",
    description: "Default opacity for target color if not specified in data",
    value: 100,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 255,
      },
    },
  });

  name: string = "arcProps";
  displayName: string = "Arc properties";
  slices: Array<FormattingSettingsSlice> = [
    this.layerType,
    ...this.strokeWidth.slices,
    this.defaultSourceColor,
    this.defaultSourceOpacity,
    ...this.sourceGradient.slices,
    ...this.sourceCategoricalPalette.slices,
    this.defaultTargetColor,
    this.defaultTargetOpacity,
    ...this.targetGradient.slices,
    ...this.targetCategoricalPalette.slices,
  ];
}

export class PathLineSettings extends FormattingSettingsCard {
  lineMiterLimit = new formattingSettings.NumUpDown({
    name: "lineMiterLimit",
    displayName: "Line miter limit",
    description: "Miter limit for lines",
    value: 4,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 100,
      },
    },
  });

  lineCapRounded = new formattingSettings.ToggleSwitch({
    name: "lineCapRounded",
    displayName: "Line cap rounded",
    description: "Whether to use rounded line caps",
    value: true,
  });

  lineJointRounded = new formattingSettings.ToggleSwitch({
    name: "lineJointRounded",
    displayName: "Line joint rounded",
    description: "Whether to use rounded line joints",
    value: true,
  });

  slices: Array<FormattingSettingsSlice> = [
    this.lineMiterLimit,
    this.lineCapRounded,
    this.lineJointRounded,
  ];
}

export class PathCardSettings extends FormattingSettingsCard {
  line = new BaseStrokeSettings();
  gradient = new NumericGradientSettings({
    presetName: "gradientPreset",
    binningMethodName: "gradientBinningMethod",
    classCountName: "gradientClassCount",
    definedIntervalName: "gradientDefinedInterval",
    manualBreaksName: "gradientManualBreaks",
    manualColorsName: "gradientManualColors",
    fieldLabel: "path color",
  });
  categoricalPalette = new CategoricalPaletteSettings({
    paletteName: "categoricalPalette",
    fieldLabel: "path color",
  });
  path = new PathLineSettings();
  billboard = new BaseBillboardSettings();

  layerType = new formattingSettings.TextInput({
    name: "layerType",
    displayName: "Layer Identifier",
    description:
      "If the layer type column is equal to this (case-insensitive) value, it will be treated as a path",
    value: "path",
    placeholder: "Enter layer type",
  });

  name: string = "pathProps";
  displayName: string = "Path properties";
  slices: Array<FormattingSettingsSlice> = [
    this.layerType,
    ...this.line.slices,
    ...this.gradient.slices,
    ...this.categoricalPalette.slices,
    ...this.path.slices,
    ...this.billboard.slices,
  ];
}

export class PolygonCardSettings extends FormattingSettingsCard {
  line = new BaseStrokeSettings();
  lineGradient = new NumericGradientSettings({
    presetName: "lineGradientPreset",
    binningMethodName: "lineGradientBinningMethod",
    classCountName: "lineGradientClassCount",
    definedIntervalName: "lineGradientDefinedInterval",
    manualBreaksName: "lineGradientManualBreaks",
    manualColorsName: "lineGradientManualColors",
    fieldLabel: "polygon line color",
    displayPrefix: "Line",
  });
  fill = new BaseFillSettings();
  fillGradient = new NumericGradientSettings({
    presetName: "fillGradientPreset",
    binningMethodName: "fillGradientBinningMethod",
    classCountName: "fillGradientClassCount",
    definedIntervalName: "fillGradientDefinedInterval",
    manualBreaksName: "fillGradientManualBreaks",
    manualColorsName: "fillGradientManualColors",
    fieldLabel: "polygon fill color",
    displayPrefix: "Fill",
  });
  lineCategoricalPalette = new CategoricalPaletteSettings({
    paletteName: "lineCategoricalPalette",
    fieldLabel: "polygon line color",
    displayPrefix: "Line",
  });
  fillCategoricalPalette = new CategoricalPaletteSettings({
    paletteName: "fillCategoricalPalette",
    fieldLabel: "polygon fill color",
    displayPrefix: "Fill",
  });
  path = new PathLineSettings();
  billboard = new BaseBillboardSettings();

  layerType = new formattingSettings.TextInput({
    name: "layerType",
    displayName: "Layer Identifier",
    description:
      "If the layer type column is equal to this (case-insensitive) value, it will be treated as a polygon",
    value: "polygon",
    placeholder: "Enter layer type",
  });

  extruded = new formattingSettings.ToggleSwitch({
    name: "extruded",
    displayName: "Extruded",
    description: "Whether polygons will be extruded",
    value: false,
  });

  wireframe = new formattingSettings.ToggleSwitch({
    name: "wireframe",
    displayName: "Wireframe",
    description: "Whether extruded polygons will be shown as wire-frames",
    value: false,
  });

  stroked = new formattingSettings.ToggleSwitch({
    name: "stroked",
    displayName: "Stroked",
    description: "Whether to draw the outline of points/polygons",
    value: true,
  });

  filled = new formattingSettings.ToggleSwitch({
    name: "filled",
    displayName: "Filled",
    description: "Whether to fill points/polygons",
    value: true,
  });

  name: string = "polygonProps";
  displayName: string = "Polygon properties";
  slices: Array<FormattingSettingsSlice> = [
    this.layerType,
    this.stroked,
    ...this.line.slices,
    ...this.lineGradient.slices,
    ...this.lineCategoricalPalette.slices,
    this.filled,
    ...this.fill.slices,
    ...this.fillGradient.slices,
    ...this.fillCategoricalPalette.slices,
    this.extruded,
    this.wireframe,
    // no lineCapRounded for polygons
    this.path.lineJointRounded,
    this.path.lineMiterLimit,
  ];
}

export class MapCardSettings extends FormattingSettingsCard {
  baseMap = new formattingSettings.ItemDropdown({
    name: "baseMap",
    displayName: "Basemap",
    description: "The base map to show",
    value: { value: DEFAULT_BASEMAP_ID, displayName: DEFAULT_BASEMAP_ID },
    items: basemapOptions,
  });

  mapboxAccessToken = new formattingSettings.TextInput({
    name: "mapboxAccessToken",
    displayName: "Mapbox access token",
    description:
      "Access token for the Mapbox BYOK satellite basemap. Stored with the report formatting settings.",
    value: "",
    placeholder: "pk...",
    visible: false,
  });

  cartoApiKey = new formattingSettings.TextInput({
    name: "cartoApiKey",
    displayName: "CARTO API key",
    description:
      "API key for CARTO basemaps. Request one at carto.com/basemaps/apikey/. Stored with the report formatting settings.",
    value: "",
    placeholder: "Your CARTO API key",
    visible: false,
  });

  aerialBasemapOpacity = new formattingSettings.Slider({
    name: "aerialBasemapOpacity",
    displayName: "Aerial basemap opacity",
    description: "Opacity for satellite/aerial basemaps only",
    value: 100,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 100,
      },
    },
    visible: false,
  });

  show3DBuildings = new formattingSettings.ToggleSwitch({
    name: "show3DBuildings",
    displayName: "Show 3D buildings",
    description: "Display OpenStreetMap building extrusions at high zoom",
    value: true,
  });

  buildingsMinZoom = new formattingSettings.NumUpDown({
    name: "buildingsMinZoom",
    displayName: "3D buildings zoom",
    description: "Zoom level where buildings appear at full height",
    value: DEFAULT_3D_BUILDINGS_MIN_ZOOM,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 24,
      },
    },
  });

  initialSouth = new formattingSettings.NumUpDown({
    name: "initialSouth",
    displayName: "Initial southern map latitude",
    description: "The bottom of the map will be at this latitude",
    value: -37.8496,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: -90,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 90,
      },
    },
  });

  initialWest = new formattingSettings.NumUpDown({
    name: "initialWest",
    displayName: "Initial western map longitude",
    description: "The left of the map will be at this longitude",
    value: 175.1771,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 180,
      },
    },
  });

  initialNorth = new formattingSettings.NumUpDown({
    name: "initialNorth",
    displayName: "Initial northern map latitude",
    description: "The top of the map will be at this latitude",
    value: -37.6735,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: -90,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 90,
      },
    },
  });

  initialEast = new formattingSettings.NumUpDown({
    name: "initialEast",
    displayName: "Initial eastern map longitude",
    description: "The right of the map will be at this longitude",
    value: 175.3555,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 180,
      },
    },
  });

  flyTo = new formattingSettings.ToggleSwitch({
    name: "flyTo",
    displayName: "Fly to",
    description: "Whether to fly to selected data points",
    value: true,
  });

  flyToDuration = new formattingSettings.Slider({
    name: "flyToDuration",
    displayName: "Fly to duration (ms)",
    description: "How long it takes to zoom to new locations",
    value: 1000,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 10000,
      },
    },
  });

  flyToPadding = new formattingSettings.Slider({
    name: "flyToPadding",
    displayName: "Fly to padding (%)",
    description:
      "If flies to, what proportion of data width/height to add to each side",
    value: 50,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 200,
      },
    },
  });

  name: string = "mapProps";
  displayName: string = "Map properties";
  slices: Array<FormattingSettingsSlice> = [
    this.baseMap,
    this.mapboxAccessToken,
    this.cartoApiKey,
    this.aerialBasemapOpacity,
    this.show3DBuildings,
    this.buildingsMinZoom,
    this.initialSouth,
    this.initialWest,
    this.initialNorth,
    this.initialEast,
    this.flyTo,
    this.flyToDuration,
    this.flyToPadding,
  ];

  applyBasemapVisibility(): void {
    const baseMap = this.baseMap.value.value;
    this.mapboxAccessToken.visible = isMapboxSatelliteBasemap(baseMap);
    this.cartoApiKey.visible = resolveBasemap(baseMap).kind === "carto-raster";
    this.aerialBasemapOpacity.visible = isAerialBasemap(baseMap);
  }
}

export class LayerControlsCardSettings extends FormattingSettingsCard {
  showLayerOrderControl = new formattingSettings.ToggleSwitch({
    name: "showLayerOrderControl",
    displayName: "Show layer order control",
    description: "Show the on-map control for changing geometry layer order",
    value: false,
  });

  showTimeSlider = new formattingSettings.ToggleSwitch({
    name: "showTimeSlider",
    displayName: "Show time slider",
    description:
      "Show the on-map time slider for scrubbing and playing the animation. Only appears when a Timestamp field is bound.",
    value: false,
  });

  layerDrawOrder = new formattingSettings.TextInput({
    name: "layerDrawOrder",
    displayName: "Layer draw order (bottom to top)",
    description:
      "Comma-separated geometry types drawn from bottom to top. Valid values are scatter, line, arc, path, polygon.",
    value: DEFAULT_LAYER_DRAW_ORDER.join(","),
    placeholder: DEFAULT_LAYER_DRAW_ORDER.join(","),
    visible: false,
  });

  name: string = "layerControls";
  displayName: string = "Layer controls";
  slices: Array<FormattingSettingsSlice> = [
    this.showLayerOrderControl,
    this.showTimeSlider,
    this.layerDrawOrder,
  ];
}

export class LegendCardSettings extends FormattingSettingsCard {
  showLegend = new formattingSettings.ToggleSwitch({
    name: "showLegend",
    displayName: "Show legend",
    description: "Show numeric and categorical color legends on the map",
    value: true,
  });

  legendOpacity = new formattingSettings.Slider({
    name: "legendOpacity",
    displayName: "Legend opacity",
    description: "Background opacity for the legend panel",
    value: 94,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 100,
      },
    },
  });

  showClassificationType = new formattingSettings.ToggleSwitch({
    name: "showClassificationType",
    displayName: "Show classification type",
    description: "Show the classification method under each legend title",
    value: true,
  });

  showScale = new formattingSettings.ToggleSwitch({
    name: "showScale",
    displayName: "Show color scale",
    description: "Show the color scale bar for each legend item",
    value: true,
  });

  headingFont = new formattingSettings.FontControl({
    name: "headingFont",
    displayName: "Heading font",
    description: "Font used for legend headings and item titles",
    fontFamily: new formattingSettings.FontPicker({
      name: "headingFontFamily",
      displayName: "Heading font family",
      value: "Segoe UI",
    }),
    fontSize: new formattingSettings.NumUpDown({
      name: "headingFontSize",
      displayName: "Heading font size",
      value: 10,
      options: {
        minValue: {
          type: powerbi.visuals.ValidatorType.Min,
          value: 1,
        },
        maxValue: {
          type: powerbi.visuals.ValidatorType.Max,
          value: 60,
        },
      },
    }),
  });

  valueFont = new formattingSettings.FontControl({
    name: "valueFont",
    displayName: "Value font",
    description: "Font used for legend class labels",
    fontFamily: new formattingSettings.FontPicker({
      name: "valueFontFamily",
      displayName: "Value font family",
      value: "Segoe UI",
    }),
    fontSize: new formattingSettings.NumUpDown({
      name: "valueFontSize",
      displayName: "Value font size",
      value: 9,
      options: {
        minValue: {
          type: powerbi.visuals.ValidatorType.Min,
          value: 1,
        },
        maxValue: {
          type: powerbi.visuals.ValidatorType.Max,
          value: 60,
        },
      },
    }),
  });

  name: string = "legendProps";
  displayName: string = "Legend";
  topLevelSlice = this.showLegend;
  slices: Array<FormattingSettingsSlice> = [
    this.legendOpacity,
    this.showClassificationType,
    this.showScale,
    this.headingFont,
    this.valueFont,
  ];
}

export class ValidationPropertiesCardSettings extends FormattingSettingsCard {
  validateGeometries = new formattingSettings.ToggleSwitch({
    name: "validateGeometries",
    displayName: "Validate Geometries",
    description:
      "Validate geometry coordinates at load time. Can be turned off for performance once data validity is confirmed.",
    value: true,
  });

  name: string = "validationProps";
  displayName: string = "Validation properties";
  slices: Array<FormattingSettingsSlice> = [this.validateGeometries];
}

export class AnimationCardSettings extends FormattingSettingsCard {
  play = new formattingSettings.ToggleSwitch({
    name: "play",
    displayName: "Play",
    description:
      "Play the trailing-window animation. Requires the Timestamp field to be bound.",
    value: false,
  });

  loop = new formattingSettings.ToggleSwitch({
    name: "loop",
    displayName: "Loop",
    description: "Restart from the beginning when playback reaches the end.",
    value: true,
  });

  speedMode = new formattingSettings.ItemDropdown({
    name: "speedMode",
    displayName: "Speed mode",
    description:
      "Duration: the whole time span plays in a fixed wall-clock time (auto-fits any data extent). Multiplier: a fixed number of simulated seconds elapse per real second.",
    value: ANIMATION_SPEED_MODE_ITEMS[0],
    items: ANIMATION_SPEED_MODE_ITEMS,
  });

  animationDuration = new formattingSettings.NumUpDown({
    name: "animationDuration",
    displayName: "Animation duration (seconds)",
    description:
      "Used in Duration speed mode: how long one full pass through the time span takes, regardless of how many years the data covers.",
    value: 30,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 1,
      },
    },
  });

  animationSpeed = new formattingSettings.NumUpDown({
    name: "animationSpeed",
    displayName: "Animation speed (sim seconds / real second)",
    description:
      "Used in Multiplier speed mode: how many simulated seconds elapse per real second of playback. The Parking review page uses 60.",
    value: 60,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
      maxValue: {
        type: powerbi.visuals.ValidatorType.Max,
        value: 100000,
      },
    },
  });

  trailLength = new formattingSettings.NumUpDown({
    name: "trailLength",
    displayName: "Trail length (seconds)",
    description:
      "Width of the trailing time window. Geometry whose timestamp falls within [time - trail length, time] is visible.",
    value: 3600,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
    },
  });

  maxHeight = new formattingSettings.NumUpDown({
    name: "maxHeight",
    displayName: "Max height (meters)",
    description:
      "Height assigned to the latest timestamp when deriving time-as-height for points and paths that do not already carry a baked Z.",
    value: 1000,
    options: {
      minValue: {
        type: powerbi.visuals.ValidatorType.Min,
        value: 0,
      },
    },
  });

  name: string = "animationProps";
  displayName: string = "Animation properties";
  slices: Array<FormattingSettingsSlice> = [
    this.play,
    this.loop,
    this.speedMode,
    this.animationDuration,
    this.animationSpeed,
    this.trailLength,
    this.maxHeight,
  ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
  labels = new LabelCardSettings();
  scatter = new ScatterCardSettings();
  heatmap = new HeatmapCardSettings();
  h3Hexagon = new H3HexagonCardSettings();
  line = new LineCardSettings();
  arc = new ArcCardSettings();
  map = new MapCardSettings();
  layerControls = new LayerControlsCardSettings();
  legend = new LegendCardSettings();
  path = new PathCardSettings();
  polygon = new PolygonCardSettings();
  highlighting = new HighlightingCardSettings();
  validation = new ValidationPropertiesCardSettings();
  animation = new AnimationCardSettings();
  cards = [
    this.map,
    this.layerControls,
    this.legend,
    this.validation,
    this.highlighting,
    this.animation,
    this.labels,
    this.scatter,
    this.heatmap,
    this.h3Hexagon,
    this.line,
    this.path,
    this.arc,
    this.polygon,
  ];

  /**
   * Update visibility of conditional slices that depend on another slice's
   * value (e.g. each gradient's class-count vs. defined-interval inputs).
   * Call from getFormattingModel(), after the model has been populated from
   * the data view.
   */
  applyConditionalVisibility(): void {
    this.map.applyBasemapVisibility();
    this.labels.applyConditionalVisibility();

    for (const card of this.cards) {
      for (const value of Object.values(card)) {
        if (value instanceof NumericGradientSettings) {
          value.applyMethodVisibility();
        }
      }
    }
  }
}
