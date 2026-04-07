import {
  decodeHex,
  interpolateGradientColor,
  RGBAColor,
  withOpacity,
} from "./col";
import { InputLayerType, OurData } from "./dataTypes";
import {
  getNumericColorRange,
  NumericColorGradient,
  NumericColorRange,
} from "./layers/col";
import {
  NumericGradientSettings,
  VisualFormattingSettingsModel,
} from "./settings";

const defaultLowColor: RGBAColor = [44, 123, 182, 255];
const defaultMiddleColor: RGBAColor = [255, 255, 191, 255];
const defaultHighColor: RGBAColor = [215, 25, 28, 255];
const legendValueFormatter = new Intl.NumberFormat(undefined, {
  maximumSignificantDigits: 4,
});

export interface GradientLegendSpec {
  key: string;
  title: string;
  lowValue: number;
  middleValue: number;
  highValue: number;
  gradientCss: string;
}

const rgbaToCss = (color: RGBAColor): string =>
  `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${(color[3] / 255).toFixed(3)})`;

const getLegendGradient = (
  settings: NumericGradientSettings,
  opacity: number,
): NumericColorGradient => ({
  lowColor: withOpacity(
    decodeHex(settings.lowColor.value.value, defaultLowColor),
    opacity,
  ),
  middleColor: settings.useMiddleColor.value
    ? withOpacity(
        decodeHex(settings.middleColor.value.value, defaultMiddleColor),
        opacity,
      )
    : null,
  highColor: withOpacity(
    decodeHex(settings.highColor.value.value, defaultHighColor),
    opacity,
  ),
});

const getLegendMidpointColor = (
  range: NumericColorRange,
  gradient: NumericColorGradient,
): RGBAColor => {
  const middleValue =
    range.minValue === null || range.maxValue === null
      ? 0
      : range.minValue + (range.maxValue - range.minValue) / 2;
  return interpolateGradientColor(
    middleValue,
    range.minValue ?? middleValue,
    range.maxValue ?? middleValue,
    gradient.lowColor,
    gradient.highColor,
    gradient.middleColor,
  );
};

const createLegendSpec = (
  key: string,
  title: string,
  range: NumericColorRange,
  gradient: NumericColorGradient,
): GradientLegendSpec | null => {
  if (range.minValue === null || range.maxValue === null) {
    return null;
  }

  const middleValue = range.minValue + (range.maxValue - range.minValue) / 2;
  const middleColor = getLegendMidpointColor(range, gradient);

  return {
    key,
    title,
    lowValue: range.minValue,
    middleValue,
    highValue: range.maxValue,
    gradientCss: `linear-gradient(90deg, ${rgbaToCss(
      gradient.lowColor,
    )} 0%, ${rgbaToCss(middleColor)} 50%, ${rgbaToCss(gradient.highColor)} 100%)`,
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
  dataPoints: OurData[],
  settings: VisualFormattingSettingsModel,
): GradientLegendSpec[] => {
  const specs: GradientLegendSpec[] = [];
  const scatterData = dataPoints.filter(
    (d) => d.type === InputLayerType.Scatter,
  );
  const lineData = dataPoints.filter((d) => d.type === InputLayerType.Line);
  const pathData = dataPoints.filter((d) => d.type === InputLayerType.Path);
  const polygonData = dataPoints.filter(
    (d) => d.type === InputLayerType.Polygon,
  );
  const arcData = dataPoints.filter((d) => d.type === InputLayerType.Arc);

  if (settings.scatter.filled.value) {
    appendLegendSpec(
      specs,
      createLegendSpec(
        "scatter-fill",
        "Scatter fill",
        getNumericColorRange(
          scatterData,
          (d) => d.scatterProperties?.fillColorValue,
        ),
        getLegendGradient(
          settings.scatter.fillGradient,
          settings.scatter.fill.defaultFillOpacity.value,
        ),
      ),
    );
  }

  if (settings.scatter.stroked.value) {
    appendLegendSpec(
      specs,
      createLegendSpec(
        "scatter-line",
        "Scatter line",
        getNumericColorRange(
          scatterData,
          (d) => d.scatterProperties?.lineColorValue,
        ),
        getLegendGradient(
          settings.scatter.lineGradient,
          settings.scatter.line.color.defaultLineOpacity.value,
        ),
      ),
    );
  }

  appendLegendSpec(
    specs,
    createLegendSpec(
      "line",
      "Line",
      getNumericColorRange(lineData, (d) => d.lineProperties?.lineColorValue),
      getLegendGradient(
        settings.line.gradient,
        settings.line.line.color.defaultLineOpacity.value,
      ),
    ),
  );

  appendLegendSpec(
    specs,
    createLegendSpec(
      "path",
      "Path",
      getNumericColorRange(pathData, (d) => d.pathProperties?.lineColorValue),
      getLegendGradient(
        settings.path.gradient,
        settings.path.line.color.defaultLineOpacity.value,
      ),
    ),
  );

  if (settings.polygon.filled.value) {
    appendLegendSpec(
      specs,
      createLegendSpec(
        "polygon-fill",
        "Polygon fill",
        getNumericColorRange(
          polygonData,
          (d) => d.polygonProperties?.fillColorValue,
        ),
        getLegendGradient(
          settings.polygon.fillGradient,
          settings.polygon.fill.defaultFillOpacity.value,
        ),
      ),
    );
  }

  if (settings.polygon.stroked.value) {
    appendLegendSpec(
      specs,
      createLegendSpec(
        "polygon-line",
        "Polygon line",
        getNumericColorRange(
          polygonData,
          (d) => d.polygonProperties?.lineColorValue,
        ),
        getLegendGradient(
          settings.polygon.lineGradient,
          settings.polygon.line.color.defaultLineOpacity.value,
        ),
      ),
    );
  }

  appendLegendSpec(
    specs,
    createLegendSpec(
      "arc-source",
      "Arc source",
      getNumericColorRange(arcData, (d) => d.arcProperties?.sourceColorValue),
      getLegendGradient(
        settings.arc.sourceGradient,
        settings.arc.defaultSourceOpacity.value,
      ),
    ),
  );

  appendLegendSpec(
    specs,
    createLegendSpec(
      "arc-target",
      "Arc target",
      getNumericColorRange(arcData, (d) => d.arcProperties?.targetColorValue),
      getLegendGradient(
        settings.arc.targetGradient,
        settings.arc.defaultTargetOpacity.value,
      ),
    ),
  );

  return specs;
};

const createStop = (label: string, value: number): HTMLDivElement => {
  const stop = document.createElement("div");
  stop.className = "deckgl-gradient-legend__stop";

  const stopLabel = document.createElement("span");
  stopLabel.className = "deckgl-gradient-legend__stop-label";
  stopLabel.textContent = label;

  const stopValue = document.createElement("span");
  stopValue.className = "deckgl-gradient-legend__stop-value";
  stopValue.textContent = formatLegendValue(value);

  stop.appendChild(stopLabel);
  stop.appendChild(stopValue);
  return stop;
};

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

  const heading = document.createElement("div");
  heading.className = "deckgl-gradient-legend__heading";
  heading.textContent = "Gradient scale";
  panel.appendChild(heading);

  for (const spec of specs) {
    const item = document.createElement("section");
    item.className = "deckgl-gradient-legend__item";
    item.setAttribute("data-legend-key", spec.key);

    const title = document.createElement("div");
    title.className = "deckgl-gradient-legend__item-title";
    title.textContent = spec.title;
    item.appendChild(title);

    const bar = document.createElement("div");
    bar.className = "deckgl-gradient-legend__bar";
    bar.style.backgroundImage = spec.gradientCss;
    item.appendChild(bar);

    const stops = document.createElement("div");
    stops.className = "deckgl-gradient-legend__stops";
    stops.appendChild(createStop("Low", spec.lowValue));
    stops.appendChild(createStop("Mid", spec.middleValue));
    stops.appendChild(createStop("High", spec.highValue));
    item.appendChild(stops);

    panel.appendChild(item);
  }

  container.appendChild(panel);
};
