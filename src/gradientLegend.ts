import powerbi from "powerbi-visuals-api";
import { interpolateGradientColor, RGBAColor, withOpacity } from "./col";
import { ColorRoleStats, ColorRoleStatsStore, LayerDataStore } from "./dataTypes";
import {
  GradientBinningMethod,
  getGradientBinningMethodDisplayName,
  getGradientLegendClasses,
  getCachedNumericColorBins,
  GradientLegendClass,
  NumericColorBins,
  NumericColorBinsCache,
} from "./gradientClassification";
import { getCategoricalPaletteColor } from "./categoricalPalettes";
import { resolveGradientPresetColors } from "./gradientPresets";
import { NumericColorGradient } from "./layers/col";
import {
  CategoricalPaletteSettings,
  NumericGradientSettings,
  VisualFormattingSettingsModel,
} from "./settings";
import { parseColorInput } from "./powerbiUtils";
import {
  getGroupedRoleColumns,
  getRoleRowCount,
} from "./roleColumnUtils";
import { createGeometryIconElement, GeometryIconType } from "./geometryIcons";
import type { RenderableGeometryType } from "./layerState";
import {
  aggregateScatterToH3Cells,
  clampH3Resolution,
  getH3CountOpacity,
  getH3HexagonCountBins,
} from "./layers/h3Hexagon";

const legendValueFormatter = new Intl.NumberFormat(undefined, {
  maximumSignificantDigits: 4,
});
const categoricalLegendCategoryLimit = 30;

type LegendRoleName =
  | "scatterFillColor"
  | "scatterLineColor"
  | "lineLineColor"
  | "pathColor"
  | "polygonFillColor"
  | "polygonLineColor"
  | "arcSourceColor"
  | "arcTargetColor";

type LegendRoleTitleMap = Partial<Record<LegendRoleName, string>>;
type LegendRoleColumn =
  | powerbi.DataViewValueColumn
  | powerbi.DataViewCategoryColumn;

const legendRoleNames: LegendRoleName[] = [
  "scatterFillColor",
  "scatterLineColor",
  "lineLineColor",
  "pathColor",
  "polygonFillColor",
  "polygonLineColor",
  "arcSourceColor",
  "arcTargetColor",
];

const legendRoleMappings: Array<[LegendRoleName, string]> = legendRoleNames.map(
  (roleName) => [roleName, roleName],
);

export interface NumericGradientLegendSpec {
  type: "numeric";
  geometryType: GeometryIconType;
  key: string;
  title: string;
  subtitle: string;
  classes: GradientLegendClass[];
  gradientCss: string;
}

export interface CategoricalLegendClass {
  label: string;
  color: RGBAColor;
  count: number;
  overflow?: boolean;
}

export interface CategoricalGradientLegendSpec {
  type: "categorical";
  geometryType: GeometryIconType;
  key: string;
  title: string;
  classes: CategoricalLegendClass[];
}

export type GradientLegendSpec =
  | NumericGradientLegendSpec
  | CategoricalGradientLegendSpec;

export interface GradientLegendRenderOptions {
  showLegend: boolean;
  legendOpacity: number;
  showClassificationType: boolean;
  showScale: boolean;
  headingFontFamily: string;
  headingFontSize: number;
  valueFontFamily: string;
  valueFontSize: number;
}

const defaultGradientLegendRenderOptions: GradientLegendRenderOptions = {
  showLegend: true,
  legendOpacity: 94,
  showClassificationType: true,
  showScale: true,
  headingFontFamily: "Segoe UI",
  headingFontSize: 10,
  valueFontFamily: "Segoe UI",
  valueFontSize: 9,
};

const rgbaToCss = (color: RGBAColor): string =>
  `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${(color[3] / 255).toFixed(3)})`;

const clampNumber = (
  value: number,
  fallback: number,
  minValue: number,
  maxValue: number,
): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(minValue, Math.min(maxValue, value));
};

const resolveGradientLegendRenderOptions = (
  options?: Partial<GradientLegendRenderOptions>,
): GradientLegendRenderOptions => ({
  ...defaultGradientLegendRenderOptions,
  ...options,
});

const getFontFamily = (
  fontFamily: string | null | undefined,
  fallback: string,
): string => {
  const normalized = (fontFamily ?? "").trim();
  return normalized.length > 0 ? normalized : fallback;
};

const getFontSizeCss = (fontSize: number, fallback: number): string =>
  `${clampNumber(fontSize, fallback, 1, 60)}pt`;

const getLegendOpacityCss = (legendOpacity: number): string =>
  (clampNumber(legendOpacity, 94, 0, 100) / 100).toFixed(3);

const applyLegendCssVariables = (
  container: HTMLDivElement,
  options: GradientLegendRenderOptions,
) => {
  container.style.setProperty(
    "--deckgl-legend-heading-font-family",
    getFontFamily(
      options.headingFontFamily,
      defaultGradientLegendRenderOptions.headingFontFamily,
    ),
  );
  container.style.setProperty(
    "--deckgl-legend-heading-font-size",
    getFontSizeCss(
      options.headingFontSize,
      defaultGradientLegendRenderOptions.headingFontSize,
    ),
  );
  container.style.setProperty(
    "--deckgl-legend-value-font-family",
    getFontFamily(
      options.valueFontFamily,
      defaultGradientLegendRenderOptions.valueFontFamily,
    ),
  );
  container.style.setProperty(
    "--deckgl-legend-value-font-size",
    getFontSizeCss(
      options.valueFontSize,
      defaultGradientLegendRenderOptions.valueFontSize,
    ),
  );
  container.style.setProperty(
    "--deckgl-legend-background-opacity",
    getLegendOpacityCss(options.legendOpacity),
  );
};

const getLegendGradient = (
  settings: NumericGradientSettings,
  opacity: number,
): NumericColorGradient =>
  resolveGradientPresetColors(settings.preset.value.value as string, opacity);

const getLegendMidpointColor = (
  bins: NumericColorBins,
  gradient: NumericColorGradient,
): RGBAColor => {
  const middleValue =
    bins.minValue === null || bins.maxValue === null
      ? 0
      : bins.minValue + (bins.maxValue - bins.minValue) / 2;
  return interpolateGradientColor(
    middleValue,
    bins.minValue ?? middleValue,
    bins.maxValue ?? middleValue,
    gradient.lowColor,
    gradient.highColor,
    gradient.middleColor,
  );
};

const createSteppedGradient = (classes: GradientLegendClass[]): string => {
  if (classes.length === 0) {
    return "";
  }

  const stops = classes.flatMap((legendClass, index) => {
    const start = (index / classes.length) * 100;
    const end = ((index + 1) / classes.length) * 100;
    const color = rgbaToCss(legendClass.color);
    return [`${color} ${start}%`, `${color} ${end}%`];
  });

  return `linear-gradient(90deg, ${stops.join(", ")})`;
};

const formatLegendRange = (lowValue: number, highValue: number): string => {
  if (lowValue === highValue) {
    return formatLegendValue(lowValue);
  }

  return `${formatLegendValue(lowValue)} - ${formatLegendValue(highValue)}`;
};

const getLegendRoleTitles = (
  dataView: powerbi.DataView | undefined,
): LegendRoleTitleMap => {
  const categorical = dataView?.categorical;
  if (!categorical) {
    return {};
  }

  const roleColumns: LegendRoleColumn[] = [
    ...getGroupedRoleColumns(
      categorical.values,
      getRoleRowCount(categorical.values, categorical.categories),
      legendRoleMappings,
      hasMeaningfulLegendRoleValue,
    ),
    ...((categorical.values ?? []) as powerbi.DataViewValueColumn[]),
    ...(categorical.categories ?? []),
  ];
  const roleTitles: LegendRoleTitleMap = {};
  for (const roleName of legendRoleNames) {
    const candidates = roleColumns.filter((column) =>
      column.source?.roles?.[roleName],
    );
    const meaningfulCandidate = candidates.find(hasMeaningfulLegendRoleValues);
    const roleColumn = meaningfulCandidate ?? candidates[0];
    const title =
      roleColumn?.source?.displayName ?? roleColumn?.source?.queryName;
    if (title) {
      roleTitles[roleName] = title;
    }
  }

  return roleTitles;
};

const hasMeaningfulLegendRoleValue = (
  _roleName: LegendRoleName,
  value: powerbi.PrimitiveValue | null | undefined,
): boolean => {
  const parsed = parseColorInput(value);
  return (
    parsed.rgbaColor !== null ||
    parsed.numericValue !== null ||
    parsed.categoricalValue !== null
  );
};

const hasMeaningfulLegendRoleValues = (column: LegendRoleColumn): boolean =>
  (column.values ?? []).some((value) => {
    const parsed = parseColorInput(value);
    return (
      parsed.rgbaColor !== null ||
      parsed.numericValue !== null ||
      parsed.categoricalValue !== null
    );
  });

const getLegendTitle = (
  roleTitles: LegendRoleTitleMap,
  roleName: LegendRoleName,
  fallbackTitle: string,
): string => roleTitles[roleName] ?? fallbackTitle;

type LegendClassColorMapper = (
  legendClass: GradientLegendClass,
  index: number,
  bins: NumericColorBins,
) => RGBAColor;

const createLegendSpec = (
  geometryType: GeometryIconType,
  key: string,
  title: string,
  bins: NumericColorBins | null,
  gradient: NumericColorGradient,
  classificationMethod: string,
  mapClassColor?: LegendClassColorMapper,
): NumericGradientLegendSpec | null => {
  if (
    !bins ||
    bins.minValue === null ||
    bins.maxValue === null ||
    bins.classCount <= 0
  ) {
    return null;
  }

  const classes = getGradientLegendClasses(bins, gradient).map(
    (legendClass, index) => ({
      ...legendClass,
      color: mapClassColor
        ? mapClassColor(legendClass, index, bins)
        : legendClass.color,
    }),
  );
  const hasMiddleStop = gradient.middleColor !== null && classes.length > 2;
  const middleColor = hasMiddleStop
    ? rgbaToCss(getLegendMidpointColor(bins, gradient))
    : null;
  const gradientCss =
    mapClassColor && classes.length > 0
      ? createSteppedGradient(classes)
      : classes.length > 1
        ? createSteppedGradient(classes)
        : hasMiddleStop
          ? `linear-gradient(90deg, ${rgbaToCss(
              gradient.lowColor,
            )} 0%, ${middleColor!} 50%, ${rgbaToCss(gradient.highColor)} 100%)`
          : `linear-gradient(90deg, ${rgbaToCss(gradient.lowColor)} 0%, ${rgbaToCss(
              gradient.highColor,
            )} 100%)`;

  return {
    type: "numeric",
    geometryType,
    key,
    title,
    subtitle: getGradientBinningMethodDisplayName(classificationMethod),
    classes,
    gradientCss,
  };
};

const createCategoricalLegendSpec = (
  geometryType: RenderableGeometryType,
  key: string,
  title: string,
  stats: ColorRoleStats | undefined,
  paletteSettings: CategoricalPaletteSettings,
  opacity: number,
): CategoricalGradientLegendSpec | null => {
  if (
    !stats ||
    stats.hasNumericColor ||
    !stats.hasCategoricalColor ||
    stats.categoryOrder.length === 0
  ) {
    return null;
  }

  const visibleCategories = stats.categoryOrder.slice(
    0,
    categoricalLegendCategoryLimit,
  );
  const classes: CategoricalLegendClass[] = visibleCategories.map((category) => ({
    label: category,
    color: getCategoricalPaletteColor(
      category,
      paletteSettings.palette.value.value as string,
      opacity,
    ),
    count: stats.categoryCounts.get(category) ?? 0,
  }));
  const overflowCount = stats.categoryOrder.length - visibleCategories.length;
  if (overflowCount > 0) {
    classes.push({
      label: `+ ${overflowCount} more categories`,
      color: [0, 0, 0, 0],
      count: overflowCount,
      overflow: true,
    });
  }

  return {
    type: "categorical",
    geometryType,
    key,
    title,
    classes,
  };
};

const appendLegendSpec = (
  specs: GradientLegendSpec[],
  spec: GradientLegendSpec | null,
) => {
  if (spec) {
    specs.push(spec);
  }
};

const getH3LegendClassRepresentativeValue = (
  legendClass: GradientLegendClass,
): number =>
  legendClass.lowValue === legendClass.highValue
    ? legendClass.highValue
    : legendClass.lowValue + (legendClass.highValue - legendClass.lowValue) / 2;

const createH3CountLegendSpec = (
  key: string,
  title: string,
  bins: NumericColorBins | null,
  gradientSettings: NumericGradientSettings,
  lowOpacity: number,
  highOpacity: number,
): NumericGradientLegendSpec | null => {
  const spec = createLegendSpec(
    "h3",
    key,
    title,
    bins,
    resolveGradientPresetColors(
      gradientSettings.preset.value.value as string,
      255,
    ),
    gradientSettings.binningMethod.value.value as string,
    (legendClass, _index, classBins) =>
      withOpacity(
        legendClass.color,
        getH3CountOpacity(
          getH3LegendClassRepresentativeValue(legendClass),
          classBins,
          lowOpacity,
          highOpacity,
        ),
      ),
  );

  if (!spec) {
    return null;
  }

  return {
    ...spec,
    classes: spec.classes.map((legendClass) => ({
      ...legendClass,
      lowValue: Math.round(legendClass.lowValue),
      highValue: Math.round(legendClass.highValue),
    })),
  };
};

export const formatLegendValue = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "";
  }

  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 100000 || abs < 0.001)) {
    return value.toExponential(2);
  }

  return legendValueFormatter.format(value);
};

export const getGradientLegendSpecs = (
  layerData: LayerDataStore,
  settings: VisualFormattingSettingsModel,
  dataView?: powerbi.DataView,
  classificationCache: NumericColorBinsCache = new Map(),
  dataVersion = "legend",
  colorRoles?: ColorRoleStatsStore,
): GradientLegendSpec[] => {
  const specs: GradientLegendSpec[] = [];
  const roleTitles = getLegendRoleTitles(dataView);
  const scatterData = layerData.scatter;
  const lineData = layerData.line;
  const pathData = layerData.path;
  const polygonData = layerData.polygon;
  const arcData = layerData.arc;
  const getBins = <T>(
    roleName: LegendRoleName,
    cacheKey: string,
    items: T[],
    getNumericValue: (item: T) => number | null | undefined,
    binSettings: {
      method: GradientBinningMethod;
      classCount: number;
      definedInterval: number;
    },
  ): NumericColorBins | null => {
    const stats = colorRoles?.[roleName];
    if (stats && !stats.hasNumericColor) {
      return null;
    }

    return getCachedNumericColorBins(
      classificationCache,
      cacheKey,
      items,
      getNumericValue,
      binSettings,
      stats,
    );
  };
  const appendCategoricalSpec = (
    geometryType: RenderableGeometryType,
    roleName: LegendRoleName,
    key: string,
    title: string,
    paletteSettings: CategoricalPaletteSettings,
    opacity: number,
  ) => {
    appendLegendSpec(
      specs,
      createCategoricalLegendSpec(
        geometryType,
        key,
        title,
        colorRoles?.[roleName],
        paletteSettings,
        opacity,
      ),
    );
  };

  if (settings.scatter.filled.value) {
    const title = getLegendTitle(roleTitles, "scatterFillColor", "Scatter fill");
    appendLegendSpec(
      specs,
      createLegendSpec(
        "scatter",
        "scatter-fill",
        title,
        getBins(
          "scatterFillColor",
          `${dataVersion}:scatter-fill`,
          scatterData,
          (d) => d.scatterProperties?.fillColorValue,
          {
            method: settings.scatter.fillGradient.binningMethod.value
              .value as GradientBinningMethod,
            classCount: settings.scatter.fillGradient.classCount.value,
            definedInterval:
              settings.scatter.fillGradient.definedInterval.value,
          },
        ),
        getLegendGradient(
          settings.scatter.fillGradient,
          settings.scatter.fill.defaultFillOpacity.value,
        ),
        settings.scatter.fillGradient.binningMethod.value.value as string,
      ),
    );
    appendCategoricalSpec(
      "scatter",
      "scatterFillColor",
      "scatter-fill",
      title,
      settings.scatter.fillCategoricalPalette,
      settings.scatter.fill.defaultFillOpacity.value,
    );
  }

  if (settings.scatter.stroked.value) {
    const title = getLegendTitle(roleTitles, "scatterLineColor", "Scatter line");
    appendLegendSpec(
      specs,
      createLegendSpec(
        "scatter",
        "scatter-line",
        title,
        getBins(
          "scatterLineColor",
          `${dataVersion}:scatter-line`,
          scatterData,
          (d) => d.scatterProperties?.lineColorValue,
          {
            method: settings.scatter.lineGradient.binningMethod.value
              .value as GradientBinningMethod,
            classCount: settings.scatter.lineGradient.classCount.value,
            definedInterval:
              settings.scatter.lineGradient.definedInterval.value,
          },
        ),
        getLegendGradient(
          settings.scatter.lineGradient,
          settings.scatter.line.color.defaultLineOpacity.value,
        ),
        settings.scatter.lineGradient.binningMethod.value.value as string,
      ),
    );
    appendCategoricalSpec(
      "scatter",
      "scatterLineColor",
      "scatter-line",
      title,
      settings.scatter.lineCategoricalPalette,
      settings.scatter.line.color.defaultLineOpacity.value,
    );
  }

  if (settings.h3Hexagon.showH3Hexagons.value) {
    const resolution = clampH3Resolution(settings.h3Hexagon.resolution.value);
    const h3Cells = aggregateScatterToH3Cells(scatterData, resolution);
    if (h3Cells.length > 0) {
      appendLegendSpec(
        specs,
        createH3CountLegendSpec(
          "h3-fill",
          "H3 point count",
          getH3HexagonCountBins(
            h3Cells,
            settings.h3Hexagon.fillGradient,
            classificationCache,
            `${dataVersion}:h3-fill:${resolution}`,
          ),
          settings.h3Hexagon.fillGradient,
          settings.h3Hexagon.lowFillOpacity.value,
          settings.h3Hexagon.highFillOpacity.value,
        ),
      );
    }
  }

  const lineTitle = getLegendTitle(roleTitles, "lineLineColor", "Line");
  appendLegendSpec(
    specs,
    createLegendSpec(
      "line",
      "line",
      lineTitle,
      getBins(
        "lineLineColor",
        `${dataVersion}:line`,
        lineData,
        (d) => d.lineProperties?.lineColorValue,
        {
          method: settings.line.gradient.binningMethod.value
            .value as GradientBinningMethod,
          classCount: settings.line.gradient.classCount.value,
          definedInterval: settings.line.gradient.definedInterval.value,
        },
      ),
      getLegendGradient(
        settings.line.gradient,
        settings.line.line.color.defaultLineOpacity.value,
      ),
      settings.line.gradient.binningMethod.value.value as string,
    ),
  );
  appendCategoricalSpec(
    "line",
    "lineLineColor",
    "line",
    lineTitle,
    settings.line.categoricalPalette,
    settings.line.line.color.defaultLineOpacity.value,
  );

  const pathTitle = getLegendTitle(roleTitles, "pathColor", "Path");
  appendLegendSpec(
    specs,
    createLegendSpec(
      "path",
      "path",
      pathTitle,
      getBins(
        "pathColor",
        `${dataVersion}:path`,
        pathData,
        (d) => d.properties?.lineColorValue,
        {
          method: settings.path.gradient.binningMethod.value
            .value as GradientBinningMethod,
          classCount: settings.path.gradient.classCount.value,
          definedInterval: settings.path.gradient.definedInterval.value,
        },
      ),
      getLegendGradient(
        settings.path.gradient,
        settings.path.line.color.defaultLineOpacity.value,
      ),
      settings.path.gradient.binningMethod.value.value as string,
    ),
  );
  appendCategoricalSpec(
    "path",
    "pathColor",
    "path",
    pathTitle,
    settings.path.categoricalPalette,
    settings.path.line.color.defaultLineOpacity.value,
  );

  if (settings.polygon.filled.value) {
    const title = getLegendTitle(roleTitles, "polygonFillColor", "Polygon fill");
    appendLegendSpec(
      specs,
      createLegendSpec(
        "polygon",
        "polygon-fill",
        title,
        getBins(
          "polygonFillColor",
          `${dataVersion}:polygon-fill`,
          polygonData,
          (d) => d.properties?.fillColorValue,
          {
            method: settings.polygon.fillGradient.binningMethod.value
              .value as GradientBinningMethod,
            classCount: settings.polygon.fillGradient.classCount.value,
            definedInterval:
              settings.polygon.fillGradient.definedInterval.value,
          },
        ),
        getLegendGradient(
          settings.polygon.fillGradient,
          settings.polygon.fill.defaultFillOpacity.value,
        ),
        settings.polygon.fillGradient.binningMethod.value.value as string,
      ),
    );
    appendCategoricalSpec(
      "polygon",
      "polygonFillColor",
      "polygon-fill",
      title,
      settings.polygon.fillCategoricalPalette,
      settings.polygon.fill.defaultFillOpacity.value,
    );
  }

  if (settings.polygon.stroked.value) {
    const title = getLegendTitle(roleTitles, "polygonLineColor", "Polygon line");
    appendLegendSpec(
      specs,
      createLegendSpec(
        "polygon",
        "polygon-line",
        title,
        getBins(
          "polygonLineColor",
          `${dataVersion}:polygon-line`,
          polygonData,
          (d) => d.properties?.lineColorValue,
          {
            method: settings.polygon.lineGradient.binningMethod.value
              .value as GradientBinningMethod,
            classCount: settings.polygon.lineGradient.classCount.value,
            definedInterval:
              settings.polygon.lineGradient.definedInterval.value,
          },
        ),
        getLegendGradient(
          settings.polygon.lineGradient,
          settings.polygon.line.color.defaultLineOpacity.value,
        ),
        settings.polygon.lineGradient.binningMethod.value.value as string,
      ),
    );
    appendCategoricalSpec(
      "polygon",
      "polygonLineColor",
      "polygon-line",
      title,
      settings.polygon.lineCategoricalPalette,
      settings.polygon.line.color.defaultLineOpacity.value,
    );
  }

  const arcSourceTitle = getLegendTitle(roleTitles, "arcSourceColor", "Arc source");
  appendLegendSpec(
    specs,
    createLegendSpec(
      "arc",
      "arc-source",
      arcSourceTitle,
      getBins(
        "arcSourceColor",
        `${dataVersion}:arc-source`,
        arcData,
        (d) => d.arcProperties?.sourceColorValue,
        {
          method: settings.arc.sourceGradient.binningMethod.value
            .value as GradientBinningMethod,
          classCount: settings.arc.sourceGradient.classCount.value,
          definedInterval: settings.arc.sourceGradient.definedInterval.value,
        },
      ),
      getLegendGradient(
        settings.arc.sourceGradient,
        settings.arc.defaultSourceOpacity.value,
      ),
      settings.arc.sourceGradient.binningMethod.value.value as string,
    ),
  );
  appendCategoricalSpec(
    "arc",
    "arcSourceColor",
    "arc-source",
    arcSourceTitle,
    settings.arc.sourceCategoricalPalette,
    settings.arc.defaultSourceOpacity.value,
  );

  const arcTargetTitle = getLegendTitle(roleTitles, "arcTargetColor", "Arc target");
  appendLegendSpec(
    specs,
    createLegendSpec(
      "arc",
      "arc-target",
      arcTargetTitle,
      getBins(
        "arcTargetColor",
        `${dataVersion}:arc-target`,
        arcData,
        (d) => d.arcProperties?.targetColorValue,
        {
          method: settings.arc.targetGradient.binningMethod.value
            .value as GradientBinningMethod,
          classCount: settings.arc.targetGradient.classCount.value,
          definedInterval: settings.arc.targetGradient.definedInterval.value,
        },
      ),
      getLegendGradient(
        settings.arc.targetGradient,
        settings.arc.defaultTargetOpacity.value,
      ),
      settings.arc.targetGradient.binningMethod.value.value as string,
    ),
  );
  appendCategoricalSpec(
    "arc",
    "arcTargetColor",
    "arc-target",
    arcTargetTitle,
    settings.arc.targetCategoricalPalette,
    settings.arc.defaultTargetOpacity.value,
  );

  return specs;
};

const createNumericLegendClassRow = (
  legendClass: GradientLegendClass,
): HTMLDivElement => {
  const row = document.createElement("div");
  row.className = "deckgl-gradient-legend__class";

  const swatch = document.createElement("span");
  swatch.className = "deckgl-gradient-legend__class-swatch";
  swatch.style.backgroundColor = rgbaToCss(legendClass.color);

  const label = document.createElement("span");
  label.className = "deckgl-gradient-legend__class-label";
  label.textContent = formatLegendRange(
    legendClass.lowValue,
    legendClass.highValue,
  );

  row.appendChild(swatch);
  row.appendChild(label);
  return row;
};

const createCategoricalLegendClassRow = (
  legendClass: CategoricalLegendClass,
): HTMLDivElement => {
  const row = document.createElement("div");
  row.className = "deckgl-gradient-legend__class";
  if (legendClass.overflow) {
    row.classList.add("deckgl-gradient-legend__class--overflow");
  }

  const swatch = document.createElement("span");
  swatch.className = "deckgl-gradient-legend__class-swatch";
  swatch.style.backgroundColor = rgbaToCss(legendClass.color);

  const label = document.createElement("span");
  label.className = "deckgl-gradient-legend__class-label";
  label.textContent = legendClass.label;

  row.appendChild(swatch);
  row.appendChild(label);
  return row;
};

export const getGradientLegendSignature = (
  specs: GradientLegendSpec[],
  options?: Partial<GradientLegendRenderOptions>,
): string => {
  const specsSignature = specs
    .map(
      (spec) => {
        if (spec.type === "categorical") {
          return `${spec.type}:${spec.geometryType}:${spec.key}:${spec.title}:${spec.classes
            .map(
              (legendClass) =>
                `${legendClass.label}:${legendClass.count}:${legendClass.color.join(",")}:${legendClass.overflow ? "overflow" : ""}`,
            )
            .join(";")}`;
        }

        return `${spec.type}:${spec.geometryType}:${spec.key}:${spec.title}:${spec.subtitle}:${spec.gradientCss}:${spec.classes
          .map(
            (legendClass) =>
              `${legendClass.lowValue}:${legendClass.highValue}:${legendClass.color.join(",")}`,
          )
          .join(";")}`;
      },
    )
    .join("|");

  if (!options) {
    return specsSignature;
  }

  const resolvedOptions = resolveGradientLegendRenderOptions(options);
  const optionsSignature = [
    resolvedOptions.showLegend ? "legend-on" : "legend-off",
    getLegendOpacityCss(resolvedOptions.legendOpacity),
    resolvedOptions.showClassificationType ? "type-on" : "type-off",
    resolvedOptions.showScale ? "scale-on" : "scale-off",
    getFontFamily(
      resolvedOptions.headingFontFamily,
      defaultGradientLegendRenderOptions.headingFontFamily,
    ),
    getFontSizeCss(
      resolvedOptions.headingFontSize,
      defaultGradientLegendRenderOptions.headingFontSize,
    ),
    getFontFamily(
      resolvedOptions.valueFontFamily,
      defaultGradientLegendRenderOptions.valueFontFamily,
    ),
    getFontSizeCss(
      resolvedOptions.valueFontSize,
      defaultGradientLegendRenderOptions.valueFontSize,
    ),
  ].join(":");

  return `${optionsSignature}||${specsSignature}`;
};

export const renderGradientLegend = (
  container: HTMLDivElement,
  specs: GradientLegendSpec[],
  options?: Partial<GradientLegendRenderOptions>,
) => {
  const resolvedOptions = resolveGradientLegendRenderOptions(options);
  applyLegendCssVariables(container, resolvedOptions);

  container.replaceChildren();
  const hidden = !resolvedOptions.showLegend || specs.length === 0;
  container.classList.toggle(
    "deckgl-gradient-legend--hidden",
    hidden,
  );

  if (hidden) {
    return;
  }

  const panel = document.createElement("div");
  panel.className = "deckgl-gradient-legend__panel";

  for (const spec of specs) {
    const item = document.createElement("section");
    item.className = `deckgl-gradient-legend__item deckgl-gradient-legend__item--${spec.type}`;
    item.setAttribute("data-legend-key", spec.key);

    const titleRow = document.createElement("div");
    titleRow.className = "deckgl-gradient-legend__item-title-row";

    const title = document.createElement("div");
    title.className = "deckgl-gradient-legend__item-title";
    title.textContent = spec.title;
    titleRow.appendChild(title);
    titleRow.appendChild(
      createGeometryIconElement(
        spec.geometryType,
        "deckgl-gradient-legend__geometry-icon",
      ),
    );
    item.appendChild(titleRow);

    if (spec.type === "numeric" && resolvedOptions.showClassificationType) {
      const subtitle = document.createElement("div");
      subtitle.className = "deckgl-gradient-legend__item-subtitle";
      subtitle.textContent = spec.subtitle;
      item.appendChild(subtitle);
    }

    if (spec.type === "numeric" && resolvedOptions.showScale) {
      const bar = document.createElement("div");
      bar.className = "deckgl-gradient-legend__bar";
      bar.style.backgroundImage = spec.gradientCss;
      item.appendChild(bar);
    }

    const classes = document.createElement("div");
    classes.className = "deckgl-gradient-legend__classes";
    if (spec.type === "categorical") {
      for (const legendClass of spec.classes) {
        classes.appendChild(createCategoricalLegendClassRow(legendClass));
      }
    } else {
      for (const legendClass of spec.classes) {
        classes.appendChild(createNumericLegendClassRow(legendClass));
      }
    }
    item.appendChild(classes);

    panel.appendChild(item);
  }

  container.appendChild(panel);
};
