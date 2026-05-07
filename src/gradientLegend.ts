import powerbi from "powerbi-visuals-api";
import { interpolateGradientColor, RGBAColor } from "./col";
import { LayerDataStore } from "./dataTypes";
import {
  GradientBinningMethod,
  getGradientBinningMethodDisplayName,
  getGradientLegendClasses,
  getCachedNumericColorBins,
  GradientLegendClass,
  NumericColorBins,
  NumericColorBinsCache,
} from "./gradientClassification";
import { resolveGradientPresetColors } from "./gradientPresets";
import { NumericColorGradient } from "./layers/col";
import {
  NumericGradientSettings,
  VisualFormattingSettingsModel,
} from "./settings";

const legendValueFormatter = new Intl.NumberFormat(undefined, {
  maximumSignificantDigits: 4,
});

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

export interface GradientLegendSpec {
  key: string;
  title: string;
  subtitle: string;
  classes: GradientLegendClass[];
  gradientCss: string;
}

const rgbaToCss = (color: RGBAColor): string =>
  `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${(color[3] / 255).toFixed(3)})`;

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
  const values = dataView?.categorical?.values;
  if (!values) {
    return {};
  }

  const roleTitles: LegendRoleTitleMap = {};
  for (const roleName of legendRoleNames) {
    const valueColumn = values.find(
      (column) => column.source?.roles?.[roleName],
    );
    const title =
      valueColumn?.source?.displayName ?? valueColumn?.source?.queryName;
    if (title) {
      roleTitles[roleName] = title;
    }
  }

  return roleTitles;
};

const getLegendTitle = (
  roleTitles: LegendRoleTitleMap,
  roleName: LegendRoleName,
  fallbackTitle: string,
): string => roleTitles[roleName] ?? fallbackTitle;

const createLegendSpec = (
  key: string,
  title: string,
  bins: NumericColorBins,
  gradient: NumericColorGradient,
  classificationMethod: string,
): GradientLegendSpec | null => {
  if (
    bins.minValue === null ||
    bins.maxValue === null ||
    bins.classCount <= 0
  ) {
    return null;
  }

  const classes = getGradientLegendClasses(bins, gradient);
  const hasMiddleStop = gradient.middleColor !== null && classes.length > 2;
  const middleColor = hasMiddleStop
    ? rgbaToCss(getLegendMidpointColor(bins, gradient))
    : null;
  const gradientCss =
    classes.length > 1
      ? createSteppedGradient(classes)
      : hasMiddleStop
        ? `linear-gradient(90deg, ${rgbaToCss(
            gradient.lowColor,
          )} 0%, ${middleColor!} 50%, ${rgbaToCss(gradient.highColor)} 100%)`
        : `linear-gradient(90deg, ${rgbaToCss(gradient.lowColor)} 0%, ${rgbaToCss(
            gradient.highColor,
          )} 100%)`;

  return {
    key,
    title,
    subtitle: getGradientBinningMethodDisplayName(classificationMethod),
    classes,
    gradientCss,
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
): GradientLegendSpec[] => {
  const specs: GradientLegendSpec[] = [];
  const roleTitles = getLegendRoleTitles(dataView);
  const scatterData = layerData.scatter;
  const lineData = layerData.line;
  const pathData = layerData.path;
  const polygonData = layerData.polygon;
  const arcData = layerData.arc;

  if (settings.scatter.filled.value) {
    appendLegendSpec(
      specs,
      createLegendSpec(
        "scatter-fill",
        getLegendTitle(roleTitles, "scatterFillColor", "Scatter fill"),
        getCachedNumericColorBins(
          classificationCache,
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
  }

  if (settings.scatter.stroked.value) {
    appendLegendSpec(
      specs,
      createLegendSpec(
        "scatter-line",
        getLegendTitle(roleTitles, "scatterLineColor", "Scatter line"),
        getCachedNumericColorBins(
          classificationCache,
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
  }

  appendLegendSpec(
    specs,
    createLegendSpec(
      "line",
      getLegendTitle(roleTitles, "lineLineColor", "Line"),
      getCachedNumericColorBins(
        classificationCache,
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

  appendLegendSpec(
    specs,
    createLegendSpec(
      "path",
      getLegendTitle(roleTitles, "pathColor", "Path"),
      getCachedNumericColorBins(
        classificationCache,
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

  if (settings.polygon.filled.value) {
    appendLegendSpec(
      specs,
      createLegendSpec(
        "polygon-fill",
        getLegendTitle(roleTitles, "polygonFillColor", "Polygon fill"),
        getCachedNumericColorBins(
          classificationCache,
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
  }

  if (settings.polygon.stroked.value) {
    appendLegendSpec(
      specs,
      createLegendSpec(
        "polygon-line",
        getLegendTitle(roleTitles, "polygonLineColor", "Polygon line"),
        getCachedNumericColorBins(
          classificationCache,
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
  }

  appendLegendSpec(
    specs,
    createLegendSpec(
      "arc-source",
      getLegendTitle(roleTitles, "arcSourceColor", "Arc source"),
      getCachedNumericColorBins(
        classificationCache,
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

  appendLegendSpec(
    specs,
    createLegendSpec(
      "arc-target",
      getLegendTitle(roleTitles, "arcTargetColor", "Arc target"),
      getCachedNumericColorBins(
        classificationCache,
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

  return specs;
};

const createLegendClassRow = (
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

export const getGradientLegendSignature = (
  specs: GradientLegendSpec[],
): string =>
  specs
    .map(
      (spec) =>
        `${spec.key}:${spec.title}:${spec.subtitle}:${spec.gradientCss}:${spec.classes
          .map(
            (legendClass) =>
              `${legendClass.lowValue}:${legendClass.highValue}:${legendClass.color.join(",")}`,
          )
          .join(";")}`,
    )
    .join("|");

export const renderGradientLegend = (
  container: HTMLDivElement,
  specs: GradientLegendSpec[],
) => {
  container.replaceChildren();
  container.classList.toggle(
    "deckgl-gradient-legend--hidden",
    specs.length === 0,
  );

  if (specs.length === 0) {
    return;
  }

  const panel = document.createElement("div");
  panel.className = "deckgl-gradient-legend__panel";

  for (const spec of specs) {
    const item = document.createElement("section");
    item.className = "deckgl-gradient-legend__item";
    item.setAttribute("data-legend-key", spec.key);

    const title = document.createElement("div");
    title.className = "deckgl-gradient-legend__item-title";
    title.textContent = spec.title;
    item.appendChild(title);

    const subtitle = document.createElement("div");
    subtitle.className = "deckgl-gradient-legend__item-subtitle";
    subtitle.textContent = spec.subtitle;
    item.appendChild(subtitle);

    const bar = document.createElement("div");
    bar.className = "deckgl-gradient-legend__bar";
    bar.style.backgroundImage = spec.gradientCss;
    item.appendChild(bar);

    const classes = document.createElement("div");
    classes.className = "deckgl-gradient-legend__classes";
    for (const legendClass of spec.classes) {
      classes.appendChild(createLegendClassRow(legendClass));
    }
    item.appendChild(classes);

    panel.appendChild(item);
  }

  container.appendChild(panel);
};
