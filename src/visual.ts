"use strict";

import * as process from "process";
(window as any).process = process;

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import VisualDataChangeOperationKind = powerbi.VisualDataChangeOperationKind;
import VisualUpdateType = powerbi.VisualUpdateType;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

import { MapCardSettings, VisualFormattingSettingsModel } from "./settings";
import { Map as MapLibreMap, NavigationControl } from "maplibre-gl";
import { MapboxOverlay as DeckOverlay } from "@deck.gl/mapbox";
import "maplibre-gl/dist/maplibre-gl.css";
import { createDatasetSnapshot } from "./mapper";
import { getDataBoundingBox } from "./geom";
import {
  GradientLegendRenderOptions,
  getGradientLegendSignature,
  getGradientLegendSpecs,
  renderGradientLegend,
} from "./gradientLegend";

import {
  DatasetSnapshot,
  GeometryCache,
  LayerDataStore,
  OurData,
} from "./dataTypes";
import { NumericColorBinsCache } from "./gradientClassification";
import getScatterLayer from "./layers/scatter";
import getLineLayer from "./layers/line";
import getArcLayer from "./layers/arc";
import getPathLayer from "./layers/path";
import getPolygonLayer from "./layers/polygon";
import { createEmptyColorRoleStatsStore } from "./colorRoles";
import {
  DEFAULT_LAYER_DRAW_ORDER,
  GEOMETRY_TYPE_LABELS,
  LAYER_IDS,
  RenderableGeometryType,
  parseLayerDrawOrder,
} from "./layerState";
import { getAggregatedTooltipHtml } from "./tooltip";

const createEmptyLayerDataStore = (): LayerDataStore => ({
  all: [],
  scatter: [],
  line: [],
  arc: [],
  path: [],
  polygon: [],
});

const createEmptyDatasetSnapshot = (version = "0"): DatasetSnapshot => ({
  layers: createEmptyLayerDataStore(),
  colorRoles: createEmptyColorRoleStatsStore(),
  idToDataPoint: new Map(),
  idToSelectionId: new Map(),
  dataHighlightedIds: [],
  bounds: null,
  version,
});

const AUTO_3D_PITCH = 45;
const FLAT_MAP_PITCH = 0;
const PITCH_EPSILON = 0.5;
const MAPLIBRE_CONTROL_MARGIN_PX = 10;

interface CameraAnimationOptions {
  duration: number;
  pitch?: number;
}

type LayerOrderDirection = "up" | "down";

interface LayerOrderControl {
  onAdd: () => HTMLElement;
  onRemove: () => void;
  render: () => void;
}

export class Visual implements IVisual {
  private host: IVisualHost;
  private formattingSettings: VisualFormattingSettingsModel;
  private formattingSettingsService: FormattingSettingsService;
  private map: any;
  private selectionManager: powerbi.extensibility.ISelectionManager;
  private dataPoints: OurData[];
  private dataset: DatasetSnapshot;
  private deckOverlay: DeckOverlay | null;
  private geometryCache: GeometryCache;
  private classificationCache: NumericColorBinsCache;
  private selectedIds: Set<string>;
  private rootElement: HTMLElement;
  private lastOptions: VisualUpdateOptions | null;
  private pendingOptions: VisualUpdateOptions | null;
  private hasInitialViewBeenSet: boolean;
  private suppressNextFlyTo: boolean;
  private currentBaseMap: string;
  private legendContainer: HTMLDivElement | null;
  private lastLegendSignature: string | null;
  private lastDataSignature: string | null;
  private dataVersionCounter: number;
  private currentActiveGeometryTypes: Set<RenderableGeometryType>;
  private currentLayerDrawOrder: RenderableGeometryType[];
  private layerOrderControl: LayerOrderControl | null;
  private lastPerspectiveLayerShown: boolean | null;
  private automaticPitchOwned: boolean;

  private createResetViewControl() {
    const container = document.createElement("div");
    container.className = "maplibregl-ctrl maplibregl-ctrl-group";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "deckgl-reset-view-button";
    button.title = "Reset map";
    button.setAttribute("aria-label", "Reset map view");
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.resetViewToAllData();
    };

    container.appendChild(button);

    return {
      onAdd: () => container,
      onRemove: () => {
        button.onclick = null;
        container.remove();
      },
    };
  }

  private getPresentGeometryTypesInDrawOrder(
    drawOrder = this.currentLayerDrawOrder,
  ): RenderableGeometryType[] {
    return drawOrder.filter(
      (geometryType) => this.dataset.layers[geometryType].length > 0,
    );
  }

  private createLayerOrderMoveButton(
    geometryType: RenderableGeometryType,
    direction: LayerOrderDirection,
    disabled: boolean,
  ): HTMLButtonElement {
    const label = GEOMETRY_TYPE_LABELS[geometryType];
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "deckgl-layer-order-control__move",
      `deckgl-layer-order-control__move--${direction}`,
    ].join(" ");
    button.title = `Move ${label} ${direction}`;
    button.setAttribute("aria-label", `Move ${label} ${direction}`);
    button.disabled = disabled;
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.moveLayerInDrawOrder(geometryType, direction);
    };

    return button;
  }

  private createLayerOrderControl(): LayerOrderControl {
    const container = document.createElement("div");
    container.className =
      "maplibregl-ctrl deckgl-layer-order-control deckgl-layer-order-control--hidden";
    container.setAttribute("aria-label", "Layer order");

    const stopPropagation = (event: Event) => event.stopPropagation();
    let listenersAttached = false;
    const attachListeners = () => {
      if (listenersAttached) {
        return;
      }

      container.addEventListener("mousedown", stopPropagation);
      container.addEventListener("dblclick", stopPropagation);
      container.addEventListener("wheel", stopPropagation);
      listenersAttached = true;
    };
    const detachListeners = () => {
      if (!listenersAttached) {
        return;
      }

      container.removeEventListener("mousedown", stopPropagation);
      container.removeEventListener("dblclick", stopPropagation);
      container.removeEventListener("wheel", stopPropagation);
      listenersAttached = false;
    };

    const render = () => {
      const presentTypes = this.getPresentGeometryTypesInDrawOrder();
      const shouldShow =
        this.formattingSettings.layerControls.showLayerOrderControl.value ===
          true && presentTypes.length > 1;

      container.classList.toggle(
        "deckgl-layer-order-control--hidden",
        !shouldShow,
      );
      container.replaceChildren();

      if (!shouldShow) {
        return;
      }

      const visualStackOrder = [...presentTypes].reverse();
      for (const [index, geometryType] of visualStackOrder.entries()) {
        const label = GEOMETRY_TYPE_LABELS[geometryType];
        const row = document.createElement("div");
        row.className = "deckgl-layer-order-control__row";

        const labelElement = document.createElement("span");
        labelElement.className = "deckgl-layer-order-control__label";
        labelElement.textContent = label;

        const buttons = document.createElement("div");
        buttons.className = "deckgl-layer-order-control__buttons";
        buttons.appendChild(
          this.createLayerOrderMoveButton(geometryType, "up", index === 0),
        );
        buttons.appendChild(
          this.createLayerOrderMoveButton(
            geometryType,
            "down",
            index === visualStackOrder.length - 1,
          ),
        );

        row.appendChild(labelElement);
        row.appendChild(buttons);
        container.appendChild(row);
      }
    };

    return {
      onAdd: () => {
        attachListeners();
        render();
        return container;
      },
      onRemove: () => {
        detachListeners();
        container.replaceChildren();
        container.remove();
      },
      render,
    };
  }

  private isDarkBaseMap(baseMap: string): boolean {
    const normalizedBaseMap = baseMap.toLowerCase();
    return (
      normalizedBaseMap.startsWith("dark") ||
      normalizedBaseMap.includes("/dark")
    );
  }

  private syncBaseMapTheme(baseMap: string) {
    this.rootElement.classList.toggle(
      "deckgl-map-visual--dark-basemap",
      this.isDarkBaseMap(baseMap),
    );
  }

  private getVisibleGeometryTypes(): Set<RenderableGeometryType> {
    return new Set(this.currentActiveGeometryTypes);
  }

  private hasRenderableArcData(): boolean {
    return this.dataset.layers.arc.some((dataPoint) => {
      const point1 = dataPoint.arcData?.point1;
      const point2 = dataPoint.arcData?.point2;

      return [point1, point2].every(
        (point) =>
          point &&
          Number.isFinite(point.lat) &&
          point.lat >= -90 &&
          point.lat <= 90 &&
          Number.isFinite(point.lon) &&
          point.lon >= -180 &&
          point.lon <= 180,
      );
    });
  }

  private isPerspectiveLayerShown(): boolean {
    const visibleGeometryTypes = this.getVisibleGeometryTypes();
    const extrudedPolygonLayerShown =
      this.formattingSettings.polygon.extruded.value === true &&
      this.dataset.layers.polygon.length > 0 &&
      visibleGeometryTypes.has("polygon");
    const arcLayerShown =
      visibleGeometryTypes.has("arc") && this.hasRenderableArcData();

    return extrudedPolygonLayerShown || arcLayerShown;
  }

  private getMapPitch(): number | null {
    const pitch = this.map?.getPitch?.();
    return typeof pitch === "number" && isFinite(pitch) ? pitch : null;
  }

  private isPitchClose(targetPitch: number): boolean {
    const pitch = this.getMapPitch();
    return pitch !== null && Math.abs(pitch - targetPitch) <= PITCH_EPSILON;
  }

  private shouldReturnToFlatPitch(): boolean {
    return this.automaticPitchOwned && this.isPitchClose(AUTO_3D_PITCH);
  }

  private getTargetPitch(forceFlatWhenInactive = false): number | null {
    if (this.isPerspectiveLayerShown()) {
      return AUTO_3D_PITCH;
    }

    if (forceFlatWhenInactive) {
      return FLAT_MAP_PITCH;
    }

    if (
      this.lastPerspectiveLayerShown === true &&
      this.shouldReturnToFlatPitch()
    ) {
      return FLAT_MAP_PITCH;
    }

    return null;
  }

  private getCameraOptionsForCurrentState(
    duration: number,
    forceFlatWhenInactive = false,
  ): CameraAnimationOptions {
    const options: CameraAnimationOptions = { duration };
    const targetPitch = this.getTargetPitch(forceFlatWhenInactive);

    if (targetPitch !== null) {
      options.pitch = targetPitch;
    }

    return options;
  }

  private recordAutomaticPitchState(cameraOptions: CameraAnimationOptions) {
    if (cameraOptions.pitch === AUTO_3D_PITCH) {
      this.automaticPitchOwned = true;
    } else if (cameraOptions.pitch === FLAT_MAP_PITCH) {
      this.automaticPitchOwned = false;
    }

    this.lastPerspectiveLayerShown = this.isPerspectiveLayerShown();
  }

  private applyAutomaticPitch(): boolean {
    if (!this.map) {
      return false;
    }

    const perspectiveLayerShown = this.isPerspectiveLayerShown();
    const previouslyShown = this.lastPerspectiveLayerShown;
    const duration = this.formattingSettings.map.flyToDuration.value;
    let didUpdatePitch = false;

    if (perspectiveLayerShown && previouslyShown !== true) {
      if (!this.isPitchClose(AUTO_3D_PITCH)) {
        this.map.easeTo({ pitch: AUTO_3D_PITCH, duration });
        didUpdatePitch = true;
      }
      this.automaticPitchOwned = didUpdatePitch;
    } else if (!perspectiveLayerShown && previouslyShown === true) {
      if (this.shouldReturnToFlatPitch()) {
        if (!this.isPitchClose(FLAT_MAP_PITCH)) {
          this.map.easeTo({ pitch: FLAT_MAP_PITCH, duration });
          didUpdatePitch = true;
        }
      }
      this.automaticPitchOwned = false;
    }

    this.lastPerspectiveLayerShown = perspectiveLayerShown;
    return didUpdatePitch;
  }

  private resetViewToAllData() {
    if (!this.map) {
      return;
    }

    this.handleFlyTo(this.formattingSettings.map, undefined, true);
    this.hasInitialViewBeenSet = true;
    this.suppressNextFlyTo = true;
    this.selectedIds.clear();
    this.renderCurrentState();
    this.selectionManager.clear();
  }

  private isMultiSelectEvent(event: any): boolean {
    const candidates = [
      event,
      event?.originalEvent,
      event?.srcEvent,
      event?.sourceEvent,
      event?.originalEvent?.srcEvent,
      event?.srcEvent?.originalEvent,
      event?.sourceEvent?.originalEvent,
      event?.sourceEvent?.srcEvent,
    ];
    return candidates.some((ev) => !!(ev && (ev.ctrlKey || ev.metaKey)));
  }

  constructor(options: VisualConstructorOptions) {
    this.host = options.host;
    this.selectionManager = options.host.createSelectionManager();
    const localizationManager = this.host.createLocalizationManager();
    this.formattingSettingsService = new FormattingSettingsService(
      localizationManager,
    );
    this.dataPoints = [];
    this.dataset = createEmptyDatasetSnapshot();
    this.deckOverlay = null;
    this.geometryCache = new Map();
    this.classificationCache = new Map();
    this.selectedIds = new Set();
    this.lastOptions = null;
    this.pendingOptions = null;
    this.hasInitialViewBeenSet = false;
    this.suppressNextFlyTo = false;
    this.legendContainer = null;
    this.lastLegendSignature = null;
    this.lastDataSignature = null;
    this.dataVersionCounter = 0;
    this.currentActiveGeometryTypes = new Set();
    this.currentLayerDrawOrder = [...DEFAULT_LAYER_DRAW_ORDER];
    this.layerOrderControl = null;
    this.lastPerspectiveLayerShown = null;
    this.automaticPitchOwned = false;
    this.rootElement = options.element;

    const settings =
      this.formattingSettingsService.populateFormattingSettingsModel(
        VisualFormattingSettingsModel,
        null,
      );
    this.formattingSettings = settings;
    this.currentBaseMap = settings.map.baseMap.value.value as string;
    this.syncBaseMapTheme(this.currentBaseMap);

    if (document) {
      this.rootElement.classList.add("deckgl-map-visual");
      this.map = new MapLibreMap({
        container: this.rootElement,
        style: this.getMapStyle(settings.map.baseMap.value.value as string),
        canvasContextAttributes: { antialias: true },
        maxZoom: 20,
      });
      this.legendContainer = document.createElement("div");
      this.legendContainer.className =
        "deckgl-gradient-legend deckgl-gradient-legend--hidden";
      this.rootElement.appendChild(this.legendContainer);
      this.map.on("error", (error) => {
        console.warn("MapLibre error", error);
      });
      this.map.on("load", () => {
        this.hasInitialViewBeenSet = false;
        this.deckOverlay = new DeckOverlay({
          interleaved: false,
          layers: [],
          onHover: (hoverInfo) => {
            const canvas = this.map?.getCanvas?.();
            if (!canvas) {
              return;
            }
            canvas.style.cursor = hoverInfo?.object ? "pointer" : "grab";
          },
          onClick: () => {
            if (this.selectedIds.size === 0) {
              return;
            }
            this.suppressNextFlyTo = true;
            this.selectedIds.clear();
            this.renderCurrentState();
            this.selectionManager.clear();
          },
          pickingRadius: 5,
          getTooltip: (hoverInfo) => {
            const tooltipHtml = getAggregatedTooltipHtml({
              hoverInfo,
              deckOverlay: this.deckOverlay,
              drawOrder: this.currentLayerDrawOrder,
              activeTypes: this.currentActiveGeometryTypes,
              layerIds: this.getActiveLayerIds(),
              radius: 5,
              depth: 25,
            });

            if (!tooltipHtml) {
              return null;
            }

            return {
              html: tooltipHtml,
              style: {
                "z-index": 2,
                color: "#a0a7b4",
                "background-color": "#29323c",
                padding: "0px",
                "border-radius": "4px",
                margin: "0px",
                "font-size": "12px",
                "margin-left": "25px",
                "max-width": "340px",
              },
            };
          },
        });
        this.map.addControl(this.deckOverlay);
        this.map.addControl(new NavigationControl());
        this.map.addControl(this.createResetViewControl(), "top-left");
        this.layerOrderControl = this.createLayerOrderControl();
        this.map.addControl(this.layerOrderControl, "bottom-right");

        const pendingOptions = this.pendingOptions;
        this.pendingOptions = null;
        if (pendingOptions) {
          this.update(pendingOptions);
        }
      });
    }
  }

  private getMapStyle(baseMap: string) {
    return {
      version: 8 as const,
      sources: {
        "raster-tiles": {
          type: "raster" as const,
          tiles: [
            `https://a.basemaps.cartocdn.com/${baseMap}/{z}/{x}/{y}{r}.png`,
            `https://b.basemaps.cartocdn.com/${baseMap}/{z}/{x}/{y}{r}.png`,
            `https://c.basemaps.cartocdn.com/${baseMap}/{z}/{x}/{y}{r}.png`,
            `https://d.basemaps.cartocdn.com/${baseMap}/{z}/{x}/{y}{r}.png`,
          ],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        },
      },
      layers: [
        {
          id: "simple-tiles",
          type: "raster" as const,
          source: "raster-tiles",
          minzoom: 0,
          maxzoom: 20,
        },
      ],
    };
  }

  private hasUpdateType(
    options: VisualUpdateOptions,
    updateType: VisualUpdateType,
  ): boolean {
    return (options.type & updateType) !== 0;
  }

  private isResizeUpdate(options: VisualUpdateOptions): boolean {
    return (
      this.hasUpdateType(options, VisualUpdateType.Resize) ||
      this.hasUpdateType(options, VisualUpdateType.ResizeEnd)
    );
  }

  private isResizeOnlyUpdate(options: VisualUpdateOptions): boolean {
    const resizeMask = VisualUpdateType.Resize | VisualUpdateType.ResizeEnd;
    return (options.type & resizeMask) !== 0 && (options.type & ~resizeMask) === 0;
  }

  private shouldRequestMoreData(
    options: VisualUpdateOptions,
    dataView: powerbi.DataView,
  ): boolean {
    const dataIsStreaming =
      options.operationKind === VisualDataChangeOperationKind.Create ||
      options.operationKind === VisualDataChangeOperationKind.Append;
    return dataIsStreaming && !!dataView.metadata?.segment;
  }

  private isDataFilterApplied(dataView: powerbi.DataView): boolean {
    return !!(dataView.metadata as any)?.isDataFilterApplied;
  }

  private getDataSignature(dataView: powerbi.DataView): string {
    const categorical = dataView.categorical;
    const category = categorical?.categories?.[0];
    const rowCount = category?.values?.length ?? 0;
    const sampleIndexes =
      rowCount > 0
        ? [0, Math.floor(rowCount / 2), rowCount - 1]
        : [];
    const categorySamples = sampleIndexes
      .map((index) => String(category?.values?.[index] ?? ""))
      .join("|");
    const valueSignature = (categorical?.values ?? [])
      .map((column) => {
        const roleSignature = Object.entries(column.source?.roles ?? {})
          .filter(([, enabled]) => enabled)
          .map(([role]) => role)
          .sort()
          .join(",");
        const values = column.values;
        const samples = sampleIndexes
          .map((index) => String(values?.[index] ?? ""))
          .join(",");
        return `${column.source?.queryName ?? column.source?.displayName}:${roleSignature}:${values?.length ?? 0}:${samples}`;
      })
      .join(";");

    return [
      rowCount,
      category?.source?.queryName ?? category?.source?.displayName ?? "",
      categorySamples,
      valueSignature,
      dataView.metadata?.segment ? "segmented" : "complete",
      this.isDataFilterApplied(dataView) ? "filtered" : "unfiltered",
    ].join("::");
  }

  private shouldParseData(
    options: VisualUpdateOptions,
    dataView: powerbi.DataView,
  ): boolean {
    if (!this.lastDataSignature || this.dataset.layers.all.length === 0) {
      return true;
    }

    if (
      options.operationKind === VisualDataChangeOperationKind.Create ||
      options.operationKind === VisualDataChangeOperationKind.Append
    ) {
      return true;
    }

    if (this.hasUpdateType(options, VisualUpdateType.Data)) {
      return true;
    }

    return this.getDataSignature(dataView) !== this.lastDataSignature;
  }

  private resizeMap() {
    this.map?.resize?.();
    this.updateOverlayLayout();
  }

  private updateBaseMap() {
    const newBaseMap = this.formattingSettings.map.baseMap.value.value as string;
    this.syncBaseMapTheme(newBaseMap);
    if (newBaseMap !== this.currentBaseMap) {
      this.map?.setStyle?.(this.getMapStyle(newBaseMap));
      this.currentBaseMap = newBaseMap;
    }
  }

  private updateOverlayLayout() {
    const rootRect = this.rootElement.getBoundingClientRect();
    if (rootRect.width <= 0 || rootRect.height <= 0) {
      return;
    }

    const maxControlHeight = Math.max(
      0,
      rootRect.height - MAPLIBRE_CONTROL_MARGIN_PX * 2,
    );
    this.rootElement.style.setProperty(
      "--deckgl-layer-order-control-max-height",
      `${Math.floor(maxControlHeight)}px`,
    );
    this.rootElement.style.setProperty(
      "--deckgl-layer-order-control-max-width",
      `${Math.floor(Math.max(0, rootRect.width - MAPLIBRE_CONTROL_MARGIN_PX * 2))}px`,
    );
  }

  private measureTask<T>(name: string, task: () => T): T {
    if (!performance?.mark || !performance?.measure) {
      return task();
    }

    const startMark = `${name}:start`;
    const endMark = `${name}:end`;
    performance.mark(startMark);
    try {
      return task();
    } finally {
      performance.mark(endMark);
      performance.measure(name, startMark, endMark);
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
    }
  }

  private pruneSelectionToVisibleIds() {
    for (const id of Array.from(this.selectedIds)) {
      if (!this.dataset.idToSelectionId.has(id)) {
        this.selectedIds.delete(id);
      }
    }
  }

  private getSetSignature(ids: Set<string>): string {
    return Array.from(ids).sort().join("|");
  }

  private getVisualSelectedIds(): Set<string> {
    return new Set(
      this.dataset.dataHighlightedIds.length > 0
        ? this.dataset.dataHighlightedIds
        : this.selectedIds,
    );
  }

  private syncHostSelection() {
    const selectionIds = Array.from(this.selectedIds)
      .map((id) => this.dataset.idToSelectionId.get(id))
      .filter(
        (selectionId): selectionId is powerbi.visuals.ISelectionId =>
          !!selectionId,
      );

    if (selectionIds.length === 0) {
      this.selectionManager.clear();
      return;
    }

    this.selectionManager.select(selectionIds, false);
  }

  private clearData() {
    this.dataVersionCounter += 1;
    this.dataset = createEmptyDatasetSnapshot(String(this.dataVersionCounter));
    this.dataPoints = this.dataset.layers.all;
    this.selectedIds.clear();
    this.lastDataSignature = null;
    this.lastLegendSignature = null;
    this.hasInitialViewBeenSet = false;
    this.currentActiveGeometryTypes = new Set();
    this.currentLayerDrawOrder = [...DEFAULT_LAYER_DRAW_ORDER];
    this.deckOverlay?.setProps({ layers: [] });
    if (this.legendContainer) {
      renderGradientLegend(
        this.legendContainer,
        [],
        this.getGradientLegendRenderOptions(),
      );
    }
    this.renderLayerOrderControl();
    this.updateOverlayLayout();
    this.applyAutomaticPitch();
  }

  private processData(options: VisualUpdateOptions, dataView: powerbi.DataView) {
    this.measureTask("powerbi-deckgl-map:parse-data", () => {
      this.dataVersionCounter += 1;
      this.classificationCache.clear();
      this.lastLegendSignature = null;
      this.dataset = createDatasetSnapshot(
        options,
        this.formattingSettings,
        this.host,
        this.geometryCache,
        String(this.dataVersionCounter),
      );
      this.dataPoints = this.dataset.layers.all;
      this.lastDataSignature = this.getDataSignature(dataView);
      this.pruneSelectionToVisibleIds();
      if (this.dataPoints.length === 0) {
        this.hasInitialViewBeenSet = false;
      }
    });
  }

  public onClick = (info, event) => {
    if (!info.object) {
      return;
    }

    const id = String(info.object.id);
    if (!this.dataset.idToSelectionId.has(id)) {
      return true;
    }

    const multiSelect = this.isMultiSelectEvent(event);
    if (this.selectedIds.has(id)) {
      if (multiSelect) {
        this.selectedIds.delete(id);
      } else {
        const onlyThisOneSelected =
          this.selectedIds.size === 1 && this.selectedIds.has(id);
        this.selectedIds.clear();
        if (!onlyThisOneSelected) {
          this.selectedIds.add(id);
        }
      }
    } else {
      if (!multiSelect) {
        this.selectedIds.clear();
      }
      this.selectedIds.add(id);
    }

    this.suppressNextFlyTo = true;
    this.renderCurrentState();
    this.syncHostSelection();
    return true;
  };

  public handleFlyTo(
    settings: MapCardSettings,
    selectedIdsOverride?: Set<string>,
    forceFlatPitchWhenInactive = false,
  ): boolean {
    if (!this.map) {
      return false;
    }

    const cameraOptions = this.getCameraOptionsForCurrentState(
      settings.flyToDuration.value,
      forceFlatPitchWhenInactive,
    );
    const activeSelectedIds =
      selectedIdsOverride && selectedIdsOverride.size > 0
        ? selectedIdsOverride
        : null;
    const dataBounds = activeSelectedIds
      ? getDataBoundingBox(
          Array.from(activeSelectedIds)
            .map((id) => this.dataset.idToDataPoint.get(id))
            .filter((dataPoint): dataPoint is OurData => !!dataPoint),
        )
      : this.dataset.bounds;
    const defaultMinLat = settings.initialSouth.value,
      defaultMaxLat = settings.initialNorth.value,
      defaultMinLon = settings.initialWest.value,
      defaultMaxLon = settings.initialEast.value;
    if (!dataBounds) {
      this.map.fitBounds(
        [
          [defaultMinLon, defaultMinLat],
          [defaultMaxLon, defaultMaxLat],
        ],
        cameraOptions,
      );
    } else {
      const ll500 = 500 * 1e-5;
      const flyToPadding = settings.flyToPadding.value / 100;
      let dLat = (dataBounds.maxLat - dataBounds.minLat) * flyToPadding;
      let dLon = (dataBounds.maxLon - dataBounds.minLon) * flyToPadding;
      dLat = Math.max(dLat, ll500);
      dLon = Math.max(dLon, ll500);
      this.map.fitBounds(
        [
          [dataBounds.minLon - dLon, dataBounds.minLat - dLat],
          [dataBounds.maxLon + dLon, dataBounds.maxLat + dLat],
        ],
        cameraOptions,
      );
    }

    this.recordAutomaticPitchState(cameraOptions);
    return true;
  }

  private applyFlyTo(dataView: powerbi.DataView): boolean {
    const suppressFlyTo = this.suppressNextFlyTo;
    this.suppressNextFlyTo = false;
    if (!this.formattingSettings.map.flyTo.value || suppressFlyTo) {
      return false;
    }

    const highlightedIds = new Set(this.dataset.dataHighlightedIds);
    if (highlightedIds.size > 0) {
      const didFlyTo = this.handleFlyTo(
        this.formattingSettings.map,
        highlightedIds,
      );
      this.hasInitialViewBeenSet = true;
      return didFlyTo;
    }

    if (this.isDataFilterApplied(dataView) || !this.hasInitialViewBeenSet) {
      const didFlyTo = this.handleFlyTo(this.formattingSettings.map);
      this.hasInitialViewBeenSet = true;
      return didFlyTo;
    }

    return false;
  }

  private getLayerDrawOrder(): RenderableGeometryType[] {
    return parseLayerDrawOrder(
      this.formattingSettings.layerControls.layerDrawOrder.value,
    );
  }

  private getActiveLayerIds(): string[] {
    return this.currentLayerDrawOrder
      .filter((geometryType) => this.currentActiveGeometryTypes.has(geometryType))
      .map((geometryType) => LAYER_IDS[geometryType]);
  }

  private renderLayerOrderControl() {
    this.layerOrderControl?.render();
  }

  private persistLayerDrawOrder(layerDrawOrder: RenderableGeometryType[]) {
    const serializedLayerDrawOrder = layerDrawOrder.join(",");
    this.formattingSettings.layerControls.layerDrawOrder.value =
      serializedLayerDrawOrder;
    this.host.persistProperties({
      merge: [
        {
          objectName: "layerControls",
          selector: null,
          properties: {
            layerDrawOrder: serializedLayerDrawOrder,
          },
        },
      ],
    });
  }

  private moveLayerInDrawOrder(
    geometryType: RenderableGeometryType,
    direction: LayerOrderDirection,
  ) {
    const layerDrawOrder = this.getLayerDrawOrder();
    const presentTypes = new Set(
      this.getPresentGeometryTypesInDrawOrder(layerDrawOrder),
    );
    const currentIndex = layerDrawOrder.indexOf(geometryType);
    const step = direction === "up" ? 1 : -1;
    let swapIndex = currentIndex + step;

    if (currentIndex < 0 || !presentTypes.has(geometryType)) {
      return;
    }

    while (
      swapIndex >= 0 &&
      swapIndex < layerDrawOrder.length &&
      !presentTypes.has(layerDrawOrder[swapIndex])
    ) {
      swapIndex += step;
    }

    if (swapIndex < 0 || swapIndex >= layerDrawOrder.length) {
      return;
    }

    const nextLayerDrawOrder = [...layerDrawOrder];
    [nextLayerDrawOrder[currentIndex], nextLayerDrawOrder[swapIndex]] = [
      nextLayerDrawOrder[swapIndex],
      nextLayerDrawOrder[currentIndex],
    ];
    this.currentLayerDrawOrder = nextLayerDrawOrder;
    this.persistLayerDrawOrder(nextLayerDrawOrder);
    this.renderCurrentState();
  }

  private getGradientLegendRenderOptions(): GradientLegendRenderOptions {
    const legendSettings = this.formattingSettings.legend;

    return {
      showLegend: legendSettings.showLegend.value === true,
      legendOpacity: legendSettings.legendOpacity.value,
      showClassificationType:
        legendSettings.showClassificationType.value === true,
      showScale: legendSettings.showScale.value === true,
      headingFontFamily:
        legendSettings.headingFont.fontFamily.value || "Segoe UI",
      headingFontSize: legendSettings.headingFont.fontSize.value,
      valueFontFamily: legendSettings.valueFont.fontFamily.value || "Segoe UI",
      valueFontSize: legendSettings.valueFont.fontSize.value,
    };
  }

  private renderLegend(dataView?: powerbi.DataView) {
    if (!this.legendContainer) {
      return;
    }

    const renderOptions = this.getGradientLegendRenderOptions();
    if (!renderOptions.showLegend) {
      const signature = getGradientLegendSignature([], renderOptions);
      if (signature === this.lastLegendSignature) {
        return;
      }

      renderGradientLegend(this.legendContainer, [], renderOptions);
      this.lastLegendSignature = signature;
      return;
    }

    const specs = getGradientLegendSpecs(
      this.dataset.layers,
      this.formattingSettings,
      dataView,
      this.classificationCache,
      this.dataset.version,
      this.dataset.colorRoles,
    );
    const signature = getGradientLegendSignature(specs, renderOptions);
    if (signature === this.lastLegendSignature) {
      return;
    }

    renderGradientLegend(this.legendContainer, specs, renderOptions);
    this.lastLegendSignature = signature;
  }

  private renderCurrentState(dataView = this.lastOptions?.dataViews?.[0]) {
    if (!this.deckOverlay) {
      return;
    }

    this.measureTask("powerbi-deckgl-map:render", () => {
      const visualSelectedIds = this.getVisualSelectedIds();
      const selectedSignature = this.getSetSignature(visualSelectedIds);
      const settings = this.formattingSettings;
      const layerData = this.dataset.layers;
      const layerDrawOrder = this.getLayerDrawOrder();
      const activeGeometryTypes = new Set<RenderableGeometryType>();
      const layers = [];

      for (const geometryType of layerDrawOrder) {
        if (layerData[geometryType].length === 0) {
          continue;
        }

        activeGeometryTypes.add(geometryType);

        if (geometryType === "scatter") {
          layers.push(
            getScatterLayer(
              layerData.scatter,
              settings.scatter,
              settings.highlighting,
              visualSelectedIds,
              selectedSignature,
              this.dataset.colorRoles,
              this.classificationCache,
              this.dataset.version,
              this.onClick,
            ),
          );
        } else if (geometryType === "line") {
          layers.push(
            getLineLayer(
              layerData.line,
              settings.line,
              settings.highlighting,
              visualSelectedIds,
              selectedSignature,
              this.dataset.colorRoles,
              this.classificationCache,
              this.dataset.version,
              this.onClick,
            ),
          );
        } else if (geometryType === "arc") {
          layers.push(
            getArcLayer(
              layerData.arc,
              settings.arc,
              settings.highlighting,
              visualSelectedIds,
              selectedSignature,
              this.dataset.colorRoles,
              this.classificationCache,
              this.dataset.version,
              this.onClick,
            ),
          );
        } else if (geometryType === "path") {
          layers.push(
            getPathLayer(
              layerData.path,
              settings.path,
              settings.highlighting,
              visualSelectedIds,
              selectedSignature,
              this.dataset.colorRoles,
              this.classificationCache,
              this.dataset.version,
              this.onClick,
            ),
          );
        } else if (geometryType === "polygon") {
          layers.push(
            getPolygonLayer(
              layerData.polygon,
              settings.polygon,
              settings.highlighting,
              visualSelectedIds,
              selectedSignature,
              this.dataset.colorRoles,
              this.classificationCache,
              this.dataset.version,
              this.onClick,
            ),
          );
        }
      }

      this.currentLayerDrawOrder = layerDrawOrder;
      this.currentActiveGeometryTypes = activeGeometryTypes;
      this.deckOverlay.setProps({ layers });
      this.renderLayerOrderControl();
      this.renderLegend(dataView);
      this.updateOverlayLayout();
    });
  }

  public update(options: VisualUpdateOptions) {
    this.lastOptions = options;
    if (this.deckOverlay === null) {
      this.pendingOptions = options;
      return;
    }

    const dataView = options.dataViews?.[0];
    if (this.isResizeUpdate(options)) {
      this.resizeMap();
    }

    if (dataView) {
      this.formattingSettings =
        this.formattingSettingsService.populateFormattingSettingsModel(
          VisualFormattingSettingsModel,
          dataView,
        );
    }
    this.updateBaseMap();
    this.renderLayerOrderControl();
    this.updateOverlayLayout();

    if (!dataView) {
      this.clearData();
      return;
    }

    if (this.shouldRequestMoreData(options, dataView)) {
      this.host.fetchMoreData(true);
      return;
    }

    const parseData = this.shouldParseData(options, dataView);
    if (parseData) {
      this.processData(options, dataView);
      this.renderCurrentState(dataView);
      const didFlyTo = this.applyFlyTo(dataView);
      if (!didFlyTo) {
        this.applyAutomaticPitch();
      }
      return;
    }

    if (this.isResizeOnlyUpdate(options)) {
      return;
    }

    this.renderCurrentState(dataView);
    this.applyAutomaticPitch();
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return this.formattingSettingsService.buildFormattingModel(
      this.formattingSettings,
    );
  }

  public destroy(): void {
    this.pendingOptions = null;
    this.selectedIds.clear();
    this.geometryCache.clear();
    this.classificationCache.clear();
    try {
      (this.deckOverlay as any)?.finalize?.();
    } catch {
      // Best-effort cleanup; MapLibre will also release controls during remove().
    }
    this.deckOverlay = null;
    this.layerOrderControl = null;
    try {
      this.map?.remove?.();
    } catch {
      // Power BI may destroy an already-removed visual during report navigation.
    }
    this.map = null;
    this.legendContainer?.remove();
    this.legendContainer = null;
  }
}

