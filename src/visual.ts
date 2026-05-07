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
  idToDataPoint: new Map(),
  idToSelectionId: new Map(),
  dataHighlightedIds: [],
  bounds: null,
  version,
});

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
  private lastOptions: VisualUpdateOptions | null;
  private pendingOptions: VisualUpdateOptions | null;
  private hasInitialViewBeenSet: boolean;
  private suppressNextFlyTo: boolean;
  private currentBaseMap: string;
  private legendContainer: HTMLDivElement | null;
  private lastLegendSignature: string | null;
  private lastDataSignature: string | null;
  private dataVersionCounter: number;

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

  private resetViewToAllData() {
    if (!this.map) {
      return;
    }

    this.handleFlyTo(this.formattingSettings.map);
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

    const settings =
      this.formattingSettingsService.populateFormattingSettingsModel(
        VisualFormattingSettingsModel,
        null,
      );
    this.formattingSettings = settings;
    this.currentBaseMap = settings.map.baseMap.value.value as string;

    if (document) {
      options.element.classList.add("deckgl-map-visual");
      this.map = new MapLibreMap({
        container: options.element,
        style: this.getMapStyle(settings.map.baseMap.value.value as string),
        canvasContextAttributes: { antialias: true },
        maxZoom: 20,
      });
      this.legendContainer = document.createElement("div");
      this.legendContainer.className =
        "deckgl-gradient-legend deckgl-gradient-legend--hidden";
      options.element.appendChild(this.legendContainer);
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
            if (!hoverInfo.object || !hoverInfo.object.tooltipHtml) {
              return null;
            }

            return {
              html: "<div>" + hoverInfo.object.tooltipHtml + "</div>",
              style: {
                "z-index": 2,
                color: "#a0a7b4",
                "background-color": "#29323c",
                padding: "2px 5px",
                "border-radius": "3px",
                margin: "0px",
                "font-size": "12px",
                "margin-left": "25px",
              },
            };
          },
        });
        this.map.addControl(this.deckOverlay);
        this.map.addControl(new NavigationControl());
        this.map.addControl(this.createResetViewControl(), "top-left");

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
  }

  private updateBaseMap() {
    const newBaseMap = this.formattingSettings.map.baseMap.value.value as string;
    if (newBaseMap !== this.currentBaseMap) {
      this.map?.setStyle?.(this.getMapStyle(newBaseMap));
      this.currentBaseMap = newBaseMap;
    }
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
    this.deckOverlay?.setProps({ layers: [] });
    if (this.legendContainer) {
      renderGradientLegend(this.legendContainer, []);
    }
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
  ) {
    if (!this.map) {
      return;
    }

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
        { duration: settings.flyToDuration.value },
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
        { duration: settings.flyToDuration.value },
      );
    }
  }

  private applyFlyTo(dataView: powerbi.DataView) {
    const suppressFlyTo = this.suppressNextFlyTo;
    this.suppressNextFlyTo = false;
    if (!this.formattingSettings.map.flyTo.value || suppressFlyTo) {
      return;
    }

    const highlightedIds = new Set(this.dataset.dataHighlightedIds);
    if (highlightedIds.size > 0) {
      this.handleFlyTo(this.formattingSettings.map, highlightedIds);
      this.hasInitialViewBeenSet = true;
      return;
    }

    if (this.isDataFilterApplied(dataView) || !this.hasInitialViewBeenSet) {
      this.handleFlyTo(this.formattingSettings.map);
      this.hasInitialViewBeenSet = true;
    }
  }

  private renderLegend(dataView?: powerbi.DataView) {
    if (!this.legendContainer) {
      return;
    }

    const specs = getGradientLegendSpecs(
      this.dataset.layers,
      this.formattingSettings,
      dataView,
      this.classificationCache,
      this.dataset.version,
    );
    const signature = getGradientLegendSignature(specs);
    if (signature === this.lastLegendSignature) {
      return;
    }

    renderGradientLegend(this.legendContainer, specs);
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
      const layers = [
        getScatterLayer(
          layerData.scatter,
          settings.scatter,
          settings.highlighting,
          visualSelectedIds,
          selectedSignature,
          this.classificationCache,
          this.dataset.version,
          this.onClick,
        ),
        getLineLayer(
          layerData.line,
          settings.line,
          settings.highlighting,
          visualSelectedIds,
          selectedSignature,
          this.classificationCache,
          this.dataset.version,
          this.onClick,
        ),
        getArcLayer(
          layerData.arc,
          settings.arc,
          settings.highlighting,
          visualSelectedIds,
          selectedSignature,
          this.classificationCache,
          this.dataset.version,
          this.onClick,
        ),
        getPathLayer(
          layerData.path,
          settings.path,
          settings.highlighting,
          visualSelectedIds,
          selectedSignature,
          this.classificationCache,
          this.dataset.version,
          this.onClick,
        ),
        getPolygonLayer(
          layerData.polygon,
          settings.polygon,
          settings.highlighting,
          visualSelectedIds,
          selectedSignature,
          this.classificationCache,
          this.dataset.version,
          this.onClick,
        ),
      ];
      this.deckOverlay.setProps({ layers });
      this.renderLegend(dataView);
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
      this.applyFlyTo(dataView);
      this.renderCurrentState(dataView);
      return;
    }

    if (this.isResizeOnlyUpdate(options)) {
      return;
    }

    this.renderCurrentState(dataView);
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
