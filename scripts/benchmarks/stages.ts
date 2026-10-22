// Times each stage of the visual's data pipeline in isolation by calling the
// same exported functions Visual.update() and Visual.buildDeckLayers() call.
// Runs unchanged under Node (tsx) and in Chrome (esbuild bundle).

import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { parseSync } from "@loaders.gl/core";
import { WKTLoader } from "@loaders.gl/wkt";
import { createDatasetSnapshot } from "../../src/mapper";
import { VisualFormattingSettingsModel } from "../../src/settings";
import { getDataBoundingBox, validateData } from "../../src/geom";
import { parseColorInput } from "../../src/powerbiUtils";
import {
  GradientBinningMethod,
  getNumericColorBins,
  NumericColorBinsCache,
} from "../../src/gradientClassification";
import { getGradientLegendSpecs } from "../../src/gradientLegend";
import { aggregateScatterToH3Cells } from "../../src/layers/h3Hexagon";
import getScatterLayer from "../../src/layers/scatter";
import getLineLayer from "../../src/layers/line";
import getArcLayer from "../../src/layers/arc";
import getPathLayer from "../../src/layers/path";
import getPolygonLayer from "../../src/layers/polygon";
import getHeatmapLayer from "../../src/layers/heatmap";
import getH3HexagonLayer from "../../src/layers/h3Hexagon";
import { getFeatureLabelLayer } from "../../src/labels/featureLabelLayer";
import { clearLabelDataCache, prepareLabelData } from "../../src/labels/labelData";
import { updateTemporalAnimationLayers } from "../../src/animationLayers";
import { isWithinTrailingWindow } from "../../src/timeHeight";
import { AnimationContext } from "../../src/timeAnimation";
import { DatasetSnapshot } from "../../src/dataTypes";
import { createMockHost, ScenarioDataView } from "./datasets";

export interface StageTiming {
  stage: string;
  firstMs: number;
  medianMs: number;
  minMs: number;
  samples: number;
  items: number;
  note?: string;
}

export interface ScenarioStageResult {
  id: string;
  description: string;
  rowCount: number;
  layerRows: Record<string, number>;
  stages: StageTiming[];
  skipped?: string;
}

export interface StageRunOptions {
  minSamples?: number;
  maxSamples?: number;
  budgetMs?: number;
  decodeWkp?: ((encoded: string) => unknown) | null;
  gc?: () => void;
}

const BINNING_METHODS: GradientBinningMethod[] = [
  "equal-interval",
  "defined-interval",
  "quantile",
  "natural-breaks",
  "manual-interval",
];

const COLOR_ROLES = [
  "scatterFillColor",
  "scatterLineColor",
  "lineLineColor",
  "pathColor",
  "polygonFillColor",
  "polygonLineColor",
  "arcSourceColor",
  "arcTargetColor",
];

const COLOR_ACCESSORS = [
  "getColor",
  "getFillColor",
  "getLineColor",
  "getSourceColor",
  "getTargetColor",
];

const now = () => performance.now();

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

// The first call runs on cold JIT, which is what a report sees on first load,
// so it is kept separate from the steady-state samples.
const timeStage = (
  stage: string,
  items: number,
  task: () => unknown,
  options: StageRunOptions,
  note?: string,
): StageTiming => {
  const minSamples = options.minSamples ?? 3;
  const maxSamples = options.maxSamples ?? 9;
  const budgetMs = options.budgetMs ?? 4000;
  options.gc?.();
  let start = now();
  task();
  const firstMs = now() - start;

  const samples: number[] = [];
  let spent = firstMs;
  while (
    samples.length < minSamples ||
    (samples.length < maxSamples && spent < budgetMs)
  ) {
    options.gc?.();
    start = now();
    task();
    const elapsed = now() - start;
    samples.push(elapsed);
    spent += elapsed;
  }

  return {
    stage,
    firstMs,
    medianMs: median(samples),
    minMs: Math.min(...samples),
    samples: samples.length,
    items,
    note,
  };
};

export const createSettings = (options: any): VisualFormattingSettingsModel =>
  new FormattingSettingsService(
    createMockHost().createLocalizationManager(),
  ).populateFormattingSettingsModel(
    VisualFormattingSettingsModel,
    options.dataViews[0],
  );

const getValueColumn = (options: any, role: string): any[] | null =>
  options.dataViews[0].categorical.values.find(
    (column: any) => column.source.roles[role],
  )?.values ?? null;

const getAnimationContext = (
  snapshot: DatasetSnapshot,
  settings: VisualFormattingSettingsModel,
  fraction = 0.5,
): AnimationContext | null => {
  const domain = snapshot.timeDomain;
  if (!domain) {
    return null;
  }
  return {
    active: true,
    domain,
    time: domain.t0 + (domain.t1 - domain.t0) * fraction,
    trailLength: Math.max(0, settings.animation.trailLength.value),
    maxHeight: 0,
  };
};

// Mirrors Visual.buildDeckLayers for one render, without the map or overlay.
export const buildLayers = (
  snapshot: DatasetSnapshot,
  settings: VisualFormattingSettingsModel,
  classificationCache: NumericColorBinsCache,
  animation: AnimationContext | null,
): any[] => {
  const layers: any[] = [];
  const selectedIds = new Set<string>();
  const onClick = () => undefined;
  const layerData = snapshot.layers;
  const version = snapshot.version;

  if (layerData.scatter.length > 0) {
    const showHeatmap = settings.heatmap.showHeatmap.value === true;
    const showH3 = settings.h3Hexagon.showH3Hexagons.value === true;
    const showPoints =
      (!showHeatmap || settings.heatmap.showScatterPoints.value === true) &&
      (!showH3 || settings.h3Hexagon.showScatterPoints.value === true);
    if (showHeatmap) {
      layers.push(getHeatmapLayer(layerData.scatter, settings.heatmap));
    }
    if (showH3) {
      layers.push(
        getH3HexagonLayer(layerData.scatter, settings.h3Hexagon, classificationCache, version),
      );
    }
    if (showPoints) {
      layers.push(
        getScatterLayer(layerData.scatter, settings.scatter, settings.highlighting, selectedIds, "", snapshot.colorRoles, classificationCache, version, onClick, animation),
      );
    }
  }
  if (layerData.line.length > 0) {
    layers.push(
      getLineLayer(layerData.line, settings.line, settings.highlighting, selectedIds, "", snapshot.colorRoles, classificationCache, version, onClick),
    );
  }
  if (layerData.arc.length > 0) {
    layers.push(
      getArcLayer(layerData.arc, settings.arc, settings.highlighting, selectedIds, "", snapshot.colorRoles, classificationCache, version, onClick),
    );
  }
  if (layerData.path.length > 0) {
    layers.push(
      getPathLayer(layerData.path, settings.path, settings.highlighting, selectedIds, "", snapshot.colorRoles, classificationCache, version, onClick, animation),
    );
  }
  if (layerData.polygon.length > 0) {
    layers.push(
      getPolygonLayer(layerData.polygon, settings.polygon, settings.highlighting, selectedIds, "", snapshot.colorRoles, classificationCache, version, onClick),
    );
  }

  const labelData = prepareLabelData(layerData.all, version);
  if (labelData.length > 0 && settings.labels.showLabels.value === true) {
    layers.push(
      getFeatureLabelLayer(
        labelData,
        settings.labels,
        10,
        animation
          ? {
              time: animation.time,
              domainStart: animation.domain.t0,
              domainSpan: animation.domain.t1 - animation.domain.t0,
              trailLength: animation.trailLength,
              maxHeight: animation.maxHeight,
            }
          : null,
      ),
    );
  }
  return layers;
};

// deck.gl calls every colour accessor once per object when it fills colour
// attributes, so sweeping them reproduces that CPU cost without a GPU.
const sweepColorAccessors = (layers: any[]): number => {
  let calls = 0;
  for (const layer of layers) {
    const data = Array.isArray(layer?.props?.data) ? layer.props.data : [];
    for (const name of COLOR_ACCESSORS) {
      const accessor = layer?.props?.[name];
      if (typeof accessor !== "function") {
        continue;
      }
      for (let index = 0; index < data.length; index += 1) {
        accessor(data[index], { index, data, target: [] });
      }
      calls += data.length;
    }
  }
  return calls;
};

const collectNumericColorValues = (snapshot: DatasetSnapshot): number[] => {
  const values: number[] = [];
  for (const data of snapshot.layers.all) {
    const value =
      data.scatterProperties?.fillColorValue ??
      data.lineProperties?.lineColorValue ??
      data.arcProperties?.sourceColorValue ??
      data.pathProperties?.lineColorValue ??
      data.polygonProperties?.fillColorValue ??
      null;
    if (typeof value === "number" && Number.isFinite(value)) {
      values.push(value);
    }
  }
  return values;
};

export const runScenarioStages = (
  scenario: ScenarioDataView,
  options: StageRunOptions = {},
): ScenarioStageResult => {
  const scenarioOptions = scenario.options;
  const settings = createSettings(scenarioOptions);
  const host = createMockHost();
  const stages: StageTiming[] = [];
  const rowCount = scenario.rowCount;
  let version = 0;
  const snapshotOf = (cache: Map<string, any>) =>
    createDatasetSnapshot(scenarioOptions, settings, host, cache, `bench-${(version += 1)}`);

  const wkt = getValueColumn(scenarioOptions, "wkt");
  const wkp = getValueColumn(scenarioOptions, "wkp");
  if (wkp && !options.decodeWkp) {
    return {
      id: scenario.id,
      description: scenario.description,
      rowCount,
      layerRows: {},
      stages: [],
      skipped: "WKP decoding needs the browser harness (the patched WKP loader throws in Node).",
    };
  }

  stages.push(
    timeStage("parse.total", rowCount, () => snapshotOf(new Map()), options,
      "createDatasetSnapshot with an empty geometry cache"),
  );
  const warmCache = new Map();
  snapshotOf(warmCache);
  stages.push(
    timeStage("parse.warmGeometryCache", rowCount, () => snapshotOf(warmCache), options,
      "createDatasetSnapshot when every geometry is already cached"),
  );
  const snapshot = snapshotOf(new Map());

  if (wkt) {
    const strings = wkt.filter((value) => value !== null).map(String);
    stages.push(
      timeStage("parse.geometry.wkt", strings.length, () => {
        for (const value of strings) {
          parseSync(value, WKTLoader);
        }
      }, options, "@loaders.gl/wkt parseSync per row"),
    );
  }
  if (wkp && options.decodeWkp) {
    const strings = wkp.filter((value) => value !== null).map(String);
    stages.push(
      timeStage("parse.geometry.wkp", strings.length, () => {
        for (const value of strings) {
          options.decodeWkp!(value);
        }
      }, options, "@wkpjs/web decode per row"),
    );
  }

  const colorValues = COLOR_ROLES.flatMap(
    (role) => getValueColumn(scenarioOptions, role) ?? [],
  );
  if (colorValues.length > 0) {
    stages.push(
      timeStage("parse.colorInput", colorValues.length, () => {
        for (const value of colorValues) {
          parseColorInput(value);
        }
      }, options, "parseColorInput once per bound colour cell"),
    );
  }

  const allData = snapshot.layers.all;
  stages.push(
    timeStage("validate", allData.length, () => {
      for (const data of allData) {
        validateData(data);
      }
    }, options),
  );
  stages.push(
    timeStage("bounds", allData.length, () => getDataBoundingBox(allData), options),
  );

  const numericValues = collectNumericColorValues(snapshot);
  if (numericValues.length > 0) {
    let minValue = Infinity;
    let maxValue = -Infinity;
    for (const value of numericValues) {
      minValue = Math.min(minValue, value);
      maxValue = Math.max(maxValue, value);
    }
    for (const method of BINNING_METHODS) {
      stages.push(
        timeStage(`classify.${method}`, numericValues.length, () =>
          getNumericColorBins(numericValues, (value) => value, {
            method,
            classCount: 7,
            definedInterval: (maxValue - minValue) / 7 || 1,
            manualBreaks: `${minValue},${(minValue + maxValue) / 2},${maxValue}`,
            manualColors: "#ff0000,#00ff00",
          }, { minValue, maxValue }),
        options,
        method === "equal-interval" || method === "defined-interval"
          ? "range comes from the parse-time colour stats, as in production"
          : undefined),
      );
    }
  }

  const scatter = snapshot.layers.scatter;
  if (scatter.length > 0) {
    for (const resolution of [7, 9]) {
      stages.push(
        timeStage(`h3.aggregate.r${resolution}`, scatter.length, () =>
          aggregateScatterToH3Cells(scatter, resolution), options,
          "h3-js latLngToCell per point plus Map counting"),
      );
    }
  }

  const animation = getAnimationContext(snapshot, settings);
  if (animation) {
    const timestamps = allData.map((data) => data.timestampSeconds);
    let frame = 0;
    stages.push(
      timeStage("time.windowMask", timestamps.length, () => {
        frame += 1;
        const time = animation.time + frame;
        let visible = 0;
        for (const timestamp of timestamps) {
          if (isWithinTrailingWindow(timestamp, time, animation.trailLength)) {
            visible += 1;
          }
        }
        return visible;
      }, options, "CPU reference only; the visual filters on the GPU"),
    );
  }

  const buildCache: NumericColorBinsCache = new Map();
  clearLabelDataCache();
  stages.push(
    timeStage("layers.build", allData.length, () => {
      buildCache.clear();
      clearLabelDataCache();
      return buildLayers(snapshot, settings, buildCache, animation);
    }, options, "layer factories incl. classification, H3 and label prep; excludes deck.gl attribute generation"),
  );
  const layers = buildLayers(snapshot, settings, buildCache, animation);

  stages.push(
    timeStage("colour.accessorSweep", allData.length, () => sweepColorAccessors(layers), options,
      "every colour accessor over every object, as deck.gl does when filling colour attributes"),
  );

  stages.push(
    timeStage("legend.specs", allData.length, () =>
      getGradientLegendSpecs(snapshot.layers, settings, scenarioOptions.dataViews[0], buildCache, snapshot.version, snapshot.colorRoles),
    options, "after layers.build, sharing its classification cache as renderLegend does"),
  );

  if (animation) {
    let frame = 0;
    stages.push(
      timeStage("time.frameUpdate", layers.length, () => {
        frame += 1;
        return updateTemporalAnimationLayers(layers, { ...animation, time: animation.time + frame });
      }, options, "per-tick CPU work: clone temporal layers with new uniforms"),
    );
  }

  return {
    id: scenario.id,
    description: scenario.description,
    rowCount,
    layerRows: {
      scatter: snapshot.layers.scatter.length,
      line: snapshot.layers.line.length,
      arc: snapshot.layers.arc.length,
      path: snapshot.layers.path.length,
      polygon: snapshot.layers.polygon.length,
    },
    stages,
  };
};
