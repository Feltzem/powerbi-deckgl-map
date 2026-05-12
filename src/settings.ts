"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import {
  defaultGradientBinningMethod,
  defaultGradientClassCount,
  defaultGradientDefinedInterval,
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
import { DEFAULT_LAYER_DRAW_ORDER } from "./layerState";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

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
  fieldLabel: string;
  displayPrefix?: string;
  defaultPreset?: GradientPresetKey;
  defaultBinningMethod?: GradientBinningMethod;
  defaultClassCount?: number;
  defaultDefinedInterval?: number;
}

export class NumericGradientSettings extends FormattingSettingsCard {
  preset: formattingSettings.ItemDropdown;
  binningMethod: formattingSettings.ItemDropdown;
  classCount: formattingSettings.NumUpDown;
  definedInterval: formattingSettings.NumUpDown;
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

    this.slices = [
      this.preset,
      this.binningMethod,
      this.classCount,
      this.definedInterval,
    ];
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
    fieldLabel: "scatter line color",
    displayPrefix: "Line",
  });
  fillGradient = new NumericGradientSettings({
    presetName: "fillGradientPreset",
    binningMethodName: "fillGradientBinningMethod",
    classCountName: "fillGradientClassCount",
    definedIntervalName: "fillGradientDefinedInterval",
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
    this.defaultRadius,
    this.radiusMinPixels,
    this.radiusMaxPixels,
    this.stroked,
    this.filled,
    ...this.fill.slices,
    ...this.fillGradient.slices,
    ...this.line.slices,
    ...this.lineGradient.slices,
    ...this.billboard.slices,
  ];
}
export class LineCardSettings extends FormattingSettingsCard {
  line = new BaseStrokeSettings();
  gradient = new NumericGradientSettings({
    presetName: "gradientPreset",
    binningMethodName: "gradientBinningMethod",
    classCountName: "gradientClassCount",
    definedIntervalName: "gradientDefinedInterval",
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
  ];
}

export class ArcCardSettings extends FormattingSettingsCard {
  strokeWidth = new BaseStrokeWidthSettings();
  sourceGradient = new NumericGradientSettings({
    presetName: "sourceGradientPreset",
    binningMethodName: "sourceGradientBinningMethod",
    classCountName: "sourceGradientClassCount",
    definedIntervalName: "sourceGradientDefinedInterval",
    fieldLabel: "arc source color",
    displayPrefix: "Source",
  });
  targetGradient = new NumericGradientSettings({
    presetName: "targetGradientPreset",
    binningMethodName: "targetGradientBinningMethod",
    classCountName: "targetGradientClassCount",
    definedIntervalName: "targetGradientDefinedInterval",
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
    this.defaultTargetColor,
    this.defaultTargetOpacity,
    ...this.targetGradient.slices,
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
    fieldLabel: "polygon line color",
    displayPrefix: "Line",
  });
  fill = new BaseFillSettings();
  fillGradient = new NumericGradientSettings({
    presetName: "fillGradientPreset",
    binningMethodName: "fillGradientBinningMethod",
    classCountName: "fillGradientClassCount",
    definedIntervalName: "fillGradientDefinedInterval",
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
    this.filled,
    ...this.fill.slices,
    ...this.fillGradient.slices,
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
    displayName: "Base Map",
    description: "The base map to show",
    value: { value: "light_all", displayName: "light_all" },
    items: [
      { value: "light_all", displayName: "light_all" },
      { value: "dark_all", displayName: "dark_all" },
      { value: "light_nolabels", displayName: "light_nolabels" },
      { value: "light_only_labels", displayName: "light_only_labels" },
      { value: "dark_nolabels", displayName: "dark_nolabels" },
      { value: "dark_only_labels", displayName: "dark_only_labels" },
      { value: "rastertiles/voyager", displayName: "rastertiles/voyager" },
      {
        value: "rastertiles/voyager_nolabels",
        displayName: "rastertiles/voyager_nolabels",
      },
      {
        value: "rastertiles/voyager_only_labels",
        displayName: "rastertiles/voyager_only_labels",
      },
      {
        value: "rastertiles/voyager_labels_under",
        displayName: "rastertiles/voyager_labels_under",
      },
    ],
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
    this.initialSouth,
    this.initialWest,
    this.initialNorth,
    this.initialEast,
    this.flyTo,
    this.flyToDuration,
    this.flyToPadding,
  ];
}

export class LayerControlsCardSettings extends FormattingSettingsCard {
  showLayerOrderControl = new formattingSettings.ToggleSwitch({
    name: "showLayerOrderControl",
    displayName: "Show layer order control",
    description: "Show the on-map control for changing geometry layer order",
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
    this.layerDrawOrder,
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

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
  scatter = new ScatterCardSettings();
  line = new LineCardSettings();
  arc = new ArcCardSettings();
  map = new MapCardSettings();
  layerControls = new LayerControlsCardSettings();
  path = new PathCardSettings();
  polygon = new PolygonCardSettings();
  highlighting = new HighlightingCardSettings();
  validation = new ValidationPropertiesCardSettings();
  cards = [
    this.map,
    this.layerControls,
    this.validation,
    this.highlighting,
    this.scatter,
    this.line,
    this.path,
    this.arc,
    this.polygon,
  ];
}
