"use strict";

import * as process from "process";
(window as any).process = process;

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import VisualDataChangeOperationKind = powerbi.VisualDataChangeOperationKind;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

import { MapCardSettings, VisualFormattingSettingsModel } from "./settings";
import { Map } from "maplibre-gl";
import { MapboxOverlay as DeckOverlay } from "@deck.gl/mapbox";
import { NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createSelectorDataPoints } from "./mapper";
import { getDataBoundingBox } from "./geom";
import { getGradientLegendSpecs, renderGradientLegend } from "./gradientLegend";

import { OurData } from "./dataTypes";
import getScatterLayer from "./layers/scatter";
import getLineLayer from "./layers/line";
import getArcLayer from "./layers/arc";
import getPathLayer from "./layers/path";
import getPolygonLayer from "./layers/polygon";

export class Visual implements IVisual {
  private host: IVisualHost;
  private formattingSettings: VisualFormattingSettingsModel;
  private formattingSettingsService: FormattingSettingsService;
  private map: any;
  private selectionManager: powerbi.extensibility.ISelectionManager;
  private dataPoints: OurData[];
  private deckOverlay: DeckOverlay | null;
  private decodeCache: {};
  private selectedIds: Set<string>;
  private lastOptions: VisualUpdateOptions | null;
  private hasInitialViewBeenSet: boolean;
  private suppressNextFlyTo: boolean;
  private currentBaseMap: string;
  private legendContainer: HTMLDivElement | null;

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
        container.remove();
      },
    };
  }

  private resetViewToAllData() {
    if (!this.map) {
      return;
    }

    const mapSettings =
      this.formattingSettings?.map ||
      this.formattingSettingsService.populateFormattingSettingsModel(
        VisualFormattingSettingsModel,
        null,
      ).map;
    this.handleFlyTo(mapSettings);
    this.hasInitialViewBeenSet = true;
    this.suppressNextFlyTo = true;
    this.selectedIds = new Set();
    this.selectionManager.clear().finally(() => {
      if (this.lastOptions) {
        this.update(this.lastOptions);
      }
    });
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
    this.deckOverlay = null;
    this.decodeCache = {};
    this.selectedIds = new Set();
    this.hasInitialViewBeenSet = false;
    this.suppressNextFlyTo = false;
    this.legendContainer = null;

    // Get the settings:
    const settings =
      this.formattingSettingsService.populateFormattingSettingsModel(
        VisualFormattingSettingsModel,
        null,
      );
    this.formattingSettings = settings;
    this.currentBaseMap = settings.map.baseMap.value.value as string;

    if (document) {
      options.element.classList.add("deckgl-map-visual");
      this.map = new Map({
        container: options.element,
        style: this.getMapStyle(settings.map.baseMap.value.value as string),
        canvasContextAttributes: { antialias: true },
        maxZoom: 20, // To match tiles
      });
      this.legendContainer = document.createElement("div");
      this.legendContainer.className =
        "deckgl-gradient-legend deckgl-gradient-legend--hidden";
      options.element.appendChild(this.legendContainer);
      this.map.on("error", (e) => {
        console.log("Error", e);
      });
      this.map.on("load", () => {
        console.log("Loaded");
        this.hasInitialViewBeenSet = false;
        this.deckOverlay = new DeckOverlay({
          interleaved: false, // Don't set to true - bricks performance!
          layers: [],
          onHover: (hoverInfo) => {
            // MapLibre controls the canvas cursor, so set it directly from pick state.
            const canvas = this.map?.getCanvas?.();
            if (!canvas) {
              return;
            }
            canvas.style.cursor = hoverInfo?.object ? "pointer" : "grab";
          },
          onClick: () => {
            // Clear things if needed:
            if (this.selectedIds.size === 0) {
              return;
            }
            console.log("Map clicked - clearing selection");
            this.suppressNextFlyTo = true;
            this.selectedIds.clear();
            this.selectionManager.clear().finally(() => {
              if (this.lastOptions) {
                this.update(this.lastOptions);
              }
            });
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
                "margin-left": "25px", // Offset from the mouse
              },
            };
          },
        });
        this.map.addControl(this.deckOverlay);
        this.map.addControl(new NavigationControl());
        this.map.addControl(this.createResetViewControl(), "top-left");
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

  public onClick = (info, event) => {
    console.log(`Clicked on layer ${info.layer.id}`);
    if (info.object) {
      const multiSelect = this.isMultiSelectEvent(event);

      // Filter the selections:
      const id = String(info.object.id);
      // const selectionId = info.object.selectionId;
      if (!id) {
        console.log(
          "Clicked on object with no id or selectionId - ignoring",
          info.object,
        );
        return true;
      }
      console.log("Clicked on object with id", id, "multiSelect:", multiSelect);
      console.log("[Selection][click] selectedIds before=", this.selectedIds);
      if (this.selectedIds.has(id)) {
        if (multiSelect) {
          // If multi-select, we're deselecting this one, so just remove it from the selection:
          this.selectedIds.delete(id);
        } else {
          // If not multi-select, then this one is already clicked, so we're unselecting it. If there's currently just
          // this one selected, then clear the selection. If there are multiple selected, then clear the selection
          // and select this one (i.e. toggle to just this one).
          const onlyThisOneSelected =
            this.selectedIds.size === 1 && this.selectedIds.has(id);
          this.selectedIds.clear();
          if (!onlyThisOneSelected) {
            this.selectedIds.add(id);
          }
        }
      } else {
        // If not multi-select, we're selecting just this one, so clear existing selections:
        if (!multiSelect) {
          this.selectedIds.clear();
        }
        this.selectedIds.add(id);
      }
      console.log(
        "[Selection][click] selectedIds after local toggle=",
        this.selectedIds,
      );

      // Now get the selection IDs of the ones we're selected. (NB: why not use the selection manager and
      // info.object.properties.selectionId? Well, for some reason the selection ID is in an undefined stat)
      const selectedIds = this.dataPoints
        .filter((x) => this.selectedIds.has(String(x.id)))
        .map((x) => x.selectionId);
      if (selectedIds.length === 0) {
        this.selectionManager.clear().then(() => {
          this.selectedIds.clear();
        });
      } else {
        this.selectionManager.select(selectedIds, false);
      }

      // Update so we can draw the highlights
      this.suppressNextFlyTo = true;
      this.update(this.lastOptions);
      return true; // don't propagate the event
    }
  };

  public handleFlyTo(
    settings: MapCardSettings,
    selectedIdsOverride?: Set<string>,
  ) {
    const activeSelectedIds =
      selectedIdsOverride && selectedIdsOverride.size > 0
        ? selectedIdsOverride
        : null;
    const boundsData = activeSelectedIds
      ? this.dataPoints.filter((d) => activeSelectedIds.has(String(d.id)))
      : this.dataPoints;
    const dataBounds = getDataBoundingBox(boundsData);
    console.log("Data bounds:", dataBounds);
    const defaultMinLat = settings.initialSouth.value,
      defaultMaxLat = settings.initialNorth.value,
      defaultMinLon = settings.initialWest.value,
      defaultMaxLon = settings.initialEast.value;
    if (!dataBounds) {
      console.log("[FlyTo] No bounds found for data - flying to default view");
      this.map.fitBounds(
        [
          [defaultMinLon, defaultMinLat],
          [defaultMaxLon, defaultMaxLat],
        ],
        { duration: settings.flyToDuration.value },
      );
    } else {
      console.log(
        `[FlyTo] Data bounds: [${dataBounds.minLon}, ${dataBounds.minLat}], [${dataBounds.maxLon}, ${dataBounds.maxLat}]`,
      );
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

  public update(options: VisualUpdateOptions) {
    this.lastOptions = options;
    if (this.deckOverlay === null) {
      console.log("Deck overlay not ready - retying in 100ms");
      setTimeout(() => {
        this.update(options);
      }, 100);
      return;
    }
    const dataView = options.dataViews?.[0];
    if (dataView) {
      this.formattingSettings =
        this.formattingSettingsService.populateFormattingSettingsModel(
          VisualFormattingSettingsModel,
          dataView,
        );
    }
    var settings = this.formattingSettings;

    // Check if baseMap changed
    const newBaseMap = settings.map.baseMap.value.value as string;
    if (newBaseMap !== this.currentBaseMap) {
      this.map.setStyle(this.getMapStyle(newBaseMap));
      this.currentBaseMap = newBaseMap;
    }

    if (!dataView) {
      this.dataPoints = [];
      this.hasInitialViewBeenSet = false;
      this.deckOverlay.setProps({ layers: [] });
      if (this.legendContainer) {
        renderGradientLegend(this.legendContainer, []);
      }
      return;
    }

    // Only request more data while Power BI is actively streaming data segments.
    // Non-data updates (resize/format/selection) may have no operationKind and must not trigger fetchMoreData.
    let shouldRequestMoreData = false;
    if (options.operationKind == VisualDataChangeOperationKind.Create) {
      console.log("New data arrived");
      shouldRequestMoreData = !!dataView.metadata?.segment;
      if (!shouldRequestMoreData) {
        console.log("Data load finished - the first segment is the only one.");
      }
    } else if (options.operationKind == VisualDataChangeOperationKind.Append) {
      shouldRequestMoreData = !!dataView.metadata?.segment;
      if (!shouldRequestMoreData) {
        console.log("Data load finished - this is the last segment.");
      }
    }

    if (shouldRequestMoreData) {
      this.host.fetchMoreData(true);
      return;
    }

    console.log("Data load finished - processing data");

    // OK, process the data now we've got all of it.
    // TODO: if we want, we could draw it iteratively, but this will increase total execution time.
    this.dataPoints = createSelectorDataPoints(
      options,
      settings,
      this.host,
      this.decodeCache,
    );
    if (this.dataPoints.length === 0) {
      this.hasInitialViewBeenSet = false;
    }
    const visibleIdSet = new Set(this.dataPoints.map((d) => String(d.id)));
    this.selectedIds = new Set(
      [...this.selectedIds].filter((id) => visibleIdSet.has(id)),
    );

    const dataHighlightedIds = this.dataPoints
      .filter((d) => d.isHighlightedFromData)
      .map((d) => String(d.id));
    const dataFilterApplied = options.dataViews[0].metadata.isDataFilterApplied;
    const visualSelectedIds = new Set(
      dataHighlightedIds.length > 0 ? dataHighlightedIds : this.selectedIds,
    );
    const flyToSelectedIds = new Set(
      dataHighlightedIds.length > 0
        ? dataHighlightedIds
        : dataFilterApplied
          ? this.dataPoints.map((d) => String(d.id))
          : [],
    );
    const suppressFlyTo = this.suppressNextFlyTo;
    this.suppressNextFlyTo = false;

    console.log("[FlyTo] suppressNextFlyTo consumed:", suppressFlyTo);
    const shouldFlyToSelection = flyToSelectedIds.size > 0;
    const shouldFlyToInitialBounds =
      !this.hasInitialViewBeenSet && !shouldFlyToSelection;

    if (settings.map.flyTo.value && !suppressFlyTo) {
      if (shouldFlyToSelection) {
        this.handleFlyTo(settings.map, flyToSelectedIds);
        this.hasInitialViewBeenSet = true;
      } else if (shouldFlyToInitialBounds) {
        this.handleFlyTo(settings.map);
        this.hasInitialViewBeenSet = true;
      }
    }
    const layers = [
      getScatterLayer(
        this.dataPoints,
        settings.scatter,
        settings.highlighting,
        visualSelectedIds,
        this.onClick,
      ),
      getLineLayer(
        this.dataPoints,
        settings.line,
        settings.highlighting,
        visualSelectedIds,
        this.onClick,
      ),
      getArcLayer(
        this.dataPoints,
        settings.arc,
        settings.highlighting,
        visualSelectedIds,
        this.onClick,
      ),
      getPathLayer(
        this.dataPoints,
        settings.path,
        settings.highlighting,
        visualSelectedIds,
        this.onClick,
      ),
      getPolygonLayer(
        this.dataPoints,
        settings.polygon,
        settings.highlighting,
        visualSelectedIds,
        this.onClick,
      ),
    ];
    this.deckOverlay.setProps({ layers });
    if (this.legendContainer) {
      renderGradientLegend(
        this.legendContainer,
        getGradientLegendSpecs(this.dataPoints, settings, dataView),
      );
    }
  }
  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return this.formattingSettingsService.buildFormattingModel(
      this.formattingSettings,
    );
  }
}
