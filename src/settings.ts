"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;


export class BaseBillboardSettings extends FormattingSettingsCard {
    billboard = new formattingSettings.ToggleSwitch({
        name: "billboard",
        displayName: "Billboard",
        description: "Whether to face camera or lay flat",
        value: false
    });

    slices: Array<FormattingSettingsSlice> = [
        this.billboard
    ];
}
export class BaseHighlightSettings extends FormattingSettingsCard {

    highlightSizeScale = new formattingSettings.NumUpDown({
        name: "highlightSizeScale",
        displayName: "Highlight size scale",
        description: "Scale factor for point/line size when highlighted",
        value: 3,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: 1
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 100
            },
        }
    });

    highlightColor = new formattingSettings.ColorPicker({
        name: "highlightColor",
        displayName: "Highlight color",
        description: "Color of highlighted points/lines",
        value: { value: "#ff0000" }
    });

    highlightOpacity = new formattingSettings.Slider({
        name: "highlightOpacity",
        displayName: "Highlight opacity",
        description: "Opacity of highlighted points/lines",
        value: 100,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: 0
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 255
            },

        }
    });

    slices: Array<FormattingSettingsSlice> = [
        this.highlightSizeScale,
        this.highlightColor,
        this.highlightOpacity
    ];
}

export class BaseStrokeWidthSettings extends FormattingSettingsCard {

    lineWidthMinPixels = new formattingSettings.NumUpDown({
        name: "lineWidthMinPixels",
        displayName: "Line width min (pixels)",
        description: "Minimum width that a line will show as (in pixels)",
        value: 1,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: 0
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 100
            },
        }
    });

    lineWidthMaxPixels = new formattingSettings.NumUpDown({
        name: "lineWidthMaxPixels",
        displayName: "Line width max (pixels)",
        description: "Maximum width that a line will show as (in pixels)",
        value: 1000,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: 0
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 1000
            },
        }
    });

    defaultLineWidth = new formattingSettings.NumUpDown({
        name: "defaultLineWidth",
        displayName: "Default line width (m)",
        description: "Default width for lines if not specified in data",
        value: 1,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: 0
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 1000
            },
        }
    });

    slices: Array<FormattingSettingsSlice> = [
        this.lineWidthMinPixels,
        this.lineWidthMaxPixels,
        this.defaultLineWidth
    ];
}
export class BaseStrokeColorSettings extends FormattingSettingsCard {

    defaultLineColor = new formattingSettings.ColorPicker({
        name: "defaultLineColor",
        displayName: "Default line color",
        description: "Default color for lines if not specified in data",
        value: { value: "#000000" }
    });

    defaultLineOpacity = new formattingSettings.Slider({
        name: "defaultLineOpacity",
        displayName: "Default line opacity",
        description: "Default opacity for lines if not specified in data",
        value: 100,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: 0
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 255
            },
        }
    });

    slices: Array<FormattingSettingsSlice> = [
        this.defaultLineColor,
        this.defaultLineOpacity
    ];
}

export class BaseStrokeSettings extends FormattingSettingsCard {
    width = new BaseStrokeWidthSettings();
    color = new BaseStrokeColorSettings();
    slices: Array<FormattingSettingsSlice> = [
        ...this.width.slices,
        ...this.color.slices
    ];
}
export class BaseFillSettings extends FormattingSettingsCard {

    defaultFillColor = new formattingSettings.ColorPicker({
        name: "defaultFillColor",
        displayName: "Default fill color",
        description: "Default color for fills if not specified in data",
        value: { value: "#000000" }
    });

    defaultFillOpacity = new formattingSettings.Slider({
        name: "defaultFillOpacity",
        displayName: "Default fill opacity",
        description: "Default opacity for fills if not specified in data",
        value: 100,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: 0
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 255
            },
        }
    });

    slices: Array<FormattingSettingsSlice> = [
        this.defaultFillColor,
        this.defaultFillOpacity
    ];
}
export class ScatterCardSettings extends FormattingSettingsCard {

    highlight = new BaseHighlightSettings();
    billboard = new BaseBillboardSettings();
    line = new BaseStrokeSettings();
    fill = new BaseFillSettings();

    geometryType = new formattingSettings.TextInput({
        name: "geometryType",
        displayName: "Scatter geometry type",
        description: "If the geometry type column is equal to this (case-insensitive) value, it will be treated as a scatter",
        value: "scatter",
        placeholder: "Enter geometry type"
    });

    radiusMinPixels = new formattingSettings.NumUpDown({
        name: "radiusMinPixels",
        displayName: "Point radius min (pixels)",
        description: "Minimum radius that a point will show as (in pixels)",
        value: 1,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: 0
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 100
            },
        }
    });

    radiusMaxPixels = new formattingSettings.NumUpDown({
        name: "radiusMaxPixels",
        displayName: "Point radius max (pixels)",
        description: "Maximum radius that a point will show as (in pixels)",
        value: 1000,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: 0
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 1000
            },
        }
    });

    defaultRadius = new formattingSettings.NumUpDown({
        name: "defaultRadius",
        displayName: "Default radius (m)",
        description: "Default radius for circles if not specified in data",
        value: 1,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: 0
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 1000
            },
        }
    });

    stroked = new formattingSettings.ToggleSwitch({
        name: "stroked",
        displayName: "Stroked",
        description: "Whether to draw the outline of points/polygons",
        value: true
    });

    filled = new formattingSettings.ToggleSwitch({
        name: "filled",
        displayName: "Filled",
        description: "Whether to fill points/polygons",
        value: true
    });

    name: string = "scatterProps";
    displayName: string = "Scatter properties";
    slices: Array<FormattingSettingsSlice> = [
        this.geometryType,
        this.defaultRadius,
        this.radiusMinPixels,
        this.radiusMaxPixels,
        this.stroked,
        this.filled,
        ...this.fill.slices,
        ...this.line.slices,
        ...this.billboard.slices,
        ...this.highlight.slices,
    ];
}
export class LineCardSettings extends FormattingSettingsCard {

    highlight = new BaseHighlightSettings();
    line = new BaseStrokeSettings();

    geometryType = new formattingSettings.TextInput({
        name: "geometryType",
        displayName: "Line geometry type",
        description: "If the geometry type column is equal to this (case-insensitive) value, it will be treated as a line",
        value: "line",
        placeholder: "Enter geometry type"
    });

    name: string = "lineProps";
    displayName: string = "Line properties";
    slices: Array<FormattingSettingsSlice> = [
        this.geometryType,
        ...this.line.slices,
        ...this.highlight.slices,
    ];
}

export class ArcCardSettings extends FormattingSettingsCard {

    highlight = new BaseHighlightSettings();
    strokeWidth = new BaseStrokeWidthSettings();


    geometryType = new formattingSettings.TextInput({
        name: "geometryType",
        displayName: "Arc geometry type",
        description: "If the geometry type column is equal to this (case-insensitive) value, it will be treated as an arc",
        value: "arc",
        placeholder: "Enter geometry type"
    });

    defaultSourceColor = new formattingSettings.ColorPicker({
        name: "defaultSourceColor",
        displayName: "Default source color",
        description: "Default color for arcs if not specified in data",
        value: { value: "#00ff00ff" }
    });

    defaultSourceOpacity = new formattingSettings.Slider({
        name: "defaultSourceOpacity",
        displayName: "Default source opacity",
        description: "Default opacity for source color if not specified in data",
        value: 100,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: 0
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 255
            },
        }
    });

    defaultTargetColor = new formattingSettings.ColorPicker({
        name: "defaultTargetColor",
        displayName: "Default target color",
        description: "Default color for arcs if not specified in data",
        value: { value: "#ff0000ff" }
    });

    defaultTargetOpacity = new formattingSettings.Slider({
        name: "defaultTargetOpacity",
        displayName: "Default target opacity",
        description: "Default opacity for target color if not specified in data",
        value: 100,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: 0
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 255
            },
        }
    });

    name: string = "arcProps";
    displayName: string = "Arc properties";
    slices: Array<FormattingSettingsSlice> = [
        this.geometryType,
        ...this.strokeWidth.slices,
        this.defaultSourceColor,
        this.defaultSourceOpacity,
        this.defaultTargetColor,
        this.defaultTargetOpacity,
        ...this.highlight.slices,
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
                value: 0
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 100
            },
        }
    });

    lineCapRounded = new formattingSettings.ToggleSwitch({
        name: "lineCapRounded",
        displayName: "Line cap rounded",
        description: "Whether to use rounded line caps",
        value: true
    });

    lineJointRounded = new formattingSettings.ToggleSwitch({
        name: "lineJointRounded",
        displayName: "Line joint rounded",
        description: "Whether to use rounded line joints",
        value: true
    });

    slices: Array<FormattingSettingsSlice> = [
        this.lineMiterLimit,
        this.lineCapRounded,
        this.lineJointRounded
    ];
}

export class PathCardSettings extends FormattingSettingsCard {

    highlight = new BaseHighlightSettings();
    line = new BaseStrokeSettings();
    path = new PathLineSettings();
    billboard = new BaseBillboardSettings();

    geometryType = new formattingSettings.TextInput({
        name: "geometryType",
        displayName: "Path geometry type",
        description: "If the geometry type column is equal to this (case-insensitive) value, it will be treated as a path",
        value: "path",
        placeholder: "Enter geometry type"
    });

    name: string = "pathProps";
    displayName: string = "Path properties";
    slices: Array<FormattingSettingsSlice> = [
        this.geometryType,
        ...this.line.slices,
        ...this.path.slices,
        ...this.highlight.slices,
        ...this.billboard.slices,
    ];
}

export class PolygonCardSettings extends FormattingSettingsCard {

    highlight = new BaseHighlightSettings();
    line = new BaseStrokeSettings();
    fill = new BaseFillSettings();
    path = new PathLineSettings();
    billboard = new BaseBillboardSettings();

    geometryType = new formattingSettings.TextInput({
        name: "geometryType",
        displayName: "Polygon geometry type",
        description: "If the geometry type column is equal to this (case-insensitive) value, it will be treated as a polygon",
        value: "polygon",
        placeholder: "Enter geometry type"
    });

    extruded = new formattingSettings.ToggleSwitch({
        name: "extruded",
        displayName: "Extruded",
        description: "Whether polygons will be extruded",
        value: false
    });

    wireframe = new formattingSettings.ToggleSwitch({
        name: "wireframe",
        displayName: "Wireframe",
        description: "Whether extruded polygons will be shown as wire-frames",
        value: false
    });

    stroked = new formattingSettings.ToggleSwitch({
        name: "stroked",
        displayName: "Stroked",
        description: "Whether to draw the outline of points/polygons",
        value: true
    });

    filled = new formattingSettings.ToggleSwitch({
        name: "filled",
        displayName: "Filled",
        description: "Whether to fill points/polygons",
        value: true
    });

    name: string = "polygonProps";
    displayName: string = "Polygon properties";
    slices: Array<FormattingSettingsSlice> = [
        this.geometryType,
        this.stroked,
        ...this.line.slices,
        this.filled,
        ...this.fill.slices,
        this.extruded,
        this.wireframe,
        // no lineCapRounded for polygons
        this.path.lineJointRounded,
        this.path.lineMiterLimit,
        ...this.highlight.slices,
    ];
}

export class EncodingCardSettings extends FormattingSettingsCard {

    encodingPrecision = new formattingSettings.NumUpDown({
        name: "encodingPrecision",
        displayName: "Encoding precision",
        description: "Number of decimal places to use when decoding Google polyline coordinates",
        value: 6,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: 0
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 10
            },
        }
    });

    name: string = "encodingProps";
    displayName: string = "Encoding properties"
    slices: Array<FormattingSettingsSlice> = [
        this.encodingPrecision
    ];
}

export class MapCardSettings extends FormattingSettingsCard {
    initialSouth = new formattingSettings.NumUpDown({
        name: "initialSouth",
        displayName: "Initial southern map latitude",
        description: "The bottom of the map will be at this latitude",
        value: -37.8496,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: -90
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 90
            },
        }
    });

    initialWest = new formattingSettings.NumUpDown({
        name: "initialWest",
        displayName: "Initial western map longitude",
        description: "The left of the map will be at this longitude",
        value: 175.1771,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: 0
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 180
            },
        }
    });

    initialNorth = new formattingSettings.NumUpDown({
        name: "initialNorth",
        displayName: "Initial northern map latitude",
        description: "The top of the map will be at this latitude",
        value: -37.6735,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: -90
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 90
            },
        }
    });

    initialEast = new formattingSettings.NumUpDown({
        name: "initialEast",
        displayName: "Initial eastern map longitude",
        description: "The right of the map will be at this longitude",
        value: 175.3555,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: 0
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 180
            },
        }
    });

    flyTo = new formattingSettings.ToggleSwitch({
        name: "flyTo",
        displayName: "Fly to",
        description: "Whether to fly to selected data points",
        value: true
    });

    flyToDuration = new formattingSettings.Slider({
        name: "flyToDuration",
        displayName: "Fly to duration (ms)",
        description: "How long it takes to zoom to new locations",
        value: 1000,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: 0
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 10000
            },
        }
    });

    flyToPadding = new formattingSettings.Slider({
        name: "flyToPadding",
        displayName: "Fly to padding (%)",
        description: "If flies to, what proportion of data width/height to add to each side",
        value: 50,
        options: {
            minValue: {
                type: powerbi.visuals.ValidatorType.Min,
                value: 0
            },
            maxValue: {
                type: powerbi.visuals.ValidatorType.Max,
                value: 200
            },
        }
    });

    name: string = "mapProps";
    displayName: string = "Map properties";
    slices: Array<FormattingSettingsSlice> = [
        this.initialSouth,
        this.initialWest,
        this.initialNorth,
        this.initialEast,
        this.flyTo,
        this.flyToDuration,
        this.flyToPadding
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    scatter = new ScatterCardSettings();
    line = new LineCardSettings();
    arc = new ArcCardSettings();
    map = new MapCardSettings();
    path = new PathCardSettings();
    polygon = new PolygonCardSettings();
    encoding = new EncodingCardSettings();
    cards = [this.map, this.scatter, this.line, this.path, this.arc, this.polygon, this.encoding];
}
