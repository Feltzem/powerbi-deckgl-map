"use strict";

import * as process from "process";
(window as any).process = process;

import powerbi from "powerbi-visuals-api";
import type { PickingInfo } from "@deck.gl/core";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import VisualDataChangeOperationKind = powerbi.VisualDataChangeOperationKind;
import VisualUpdateType = powerbi.VisualUpdateType;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

import {
  ANIMATION_SPEED_MODE_DURATION,
  ANIMATION_SPEED_MODE_ITEMS,
  AnimationCardSettings,
  MapCardSettings,
  VisualFormattingSettingsModel,
} from "./settings";
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
  OurData,
  createEmptyLayerDataStore,
} from "./dataTypes";
import { NumericColorBinsCache } from "./gradientClassification";
import {
  AnimationContext,
  resolveAnimationSpeed,
  TimeAnimationController,
} from "./timeAnimation";
import getScatterLayer from "./layers/scatter";
import getHeatmapLayer from "./layers/heatmap";
import getH3HexagonLayer, {
  getH3HexagonTooltipHtml,
} from "./layers/h3Hexagon";
import getLineLayer from "./layers/line";
import getArcLayer from "./layers/arc";
import getPathLayer from "./layers/path";
import getPolygonLayer from "./layers/polygon";
import { createEmptyColorRoleStatsStore } from "./colorRoles";
import {
  DEFAULT_LAYER_DRAW_ORDER,
  GEOMETRY_TYPE_LABELS,
  RenderableGeometryType,
  parseLayerDrawOrder,
} from "./layerState";
import { getAggregatedTooltipHtml } from "./tooltip";
import { dataViewHasRole, getDataViewSignature } from "./roleColumnUtils";
import {
  formatAnimationTime,
  getAnimationTimeTooltipHtml,
} from "./animationTooltip";
import { getScatterSymbol, getScatterSymbolType } from "./scatterSymbols";
import {
  BASEMAP_RASTER_LAYER_ID,
  clampAerialBasemapOpacity,
  getBasemapStyle,
  getBasemapStyleSignature,
  resolveBasemap,
} from "./basemaps";
import {
  BUILDINGS_LAYER_ID,
  BUILDINGS_SOURCE_ID,
  clamp3DBuildingsMinZoom,
  create3DBuildingsLayer,
  create3DBuildingsSource,
  getFirstSymbolLayerId,
} from "./buildings";
import {
  getActiveDeckLayerIds,
  updateTemporalAnimationLayers,
} from "./animationLayers";
import { syncCompletedAnimationPlayback } from "./animationPlayback";
import {
  getTooltipPlacementStyle,
  TooltipPlacementBounds,
} from "./tooltipPlacement";

const createEmptyDatasetSnapshot = (version = "0"): DatasetSnapshot => ({
  layers: createEmptyLayerDataStore(),
  colorRoles: createEmptyColorRoleStatsStore(),
  idToDataPoint: new Map(),
  idToSelectionId: new Map(),
  dataHighlightedIds: [],
  bounds: null,
  version,
  timeDomain: null,
  elevationFieldBound: false,
  scatterElevationFieldBound: false,
  scatterHasVisibleElevation: false,
});

const AUTO_3D_PITCH = 45;
const FLAT_MAP_PITCH = 0;
const PITCH_EPSILON = 0.5;
const MAPLIBRE_CONTROL_MARGIN_PX = 10;
const H3_TOOLTIP_MAX_WIDTH_PX = 220;
const MULTI_TOOLTIP_MAX_WIDTH_PX = 340;
const TOOLTIP_INTERACTION_HIDE_DELAY_MS = 900;
const RASTER_OPACITY_EPSILON = 0.0001;

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

// Same shape as LayerOrderControl: an on-map control with a re-render hook.
type MapOverlayControl = LayerOrderControl;

interface VisualTooltipContent {
  html: string;
  style: Partial<CSSStyleDeclaration>;
}

interface ModifierKeyEvent {
  ctrlKey?: boolean;
  metaKey?: boolean;
  originalEvent?: unknown;
  srcEvent?: unknown;
  sourceEvent?: unknown;
}

const asModifierKeyEvent = (event: unknown): ModifierKeyEvent | null =>
  event && typeof event === "object" ? (event as ModifierKeyEvent) : null;

export class Visual implements IVisual {
  private host: IVisualHost;
  private formattingSettings: VisualFormattingSettingsModel;
  private formattingSettingsService: FormattingSettingsService;
  private map: MapLibreMap | null;
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
  private currentBaseMapStyleSignature: string;
  private legendContainer: HTMLDivElement | null;
  private lastLegendSignature: string | null;
  private lastDataSignature: string | null;
  private lastParseHadTimestampRole: boolean;
  private dataVersionCounter: number;
  private currentActiveGeometryTypes: Set<RenderableGeometryType>;
  private currentLayerDrawOrder: RenderableGeometryType[];
  private currentDeckLayers: any[];
  private currentActiveLayerIds: string[];
  private layerOrderControl: LayerOrderControl | null;
  private timeSliderControl: MapOverlayControl | null;
  private lastPerspectiveLayerShown: boolean | null;
  private automaticPitchOwned: boolean;
  private buildingLayerSignature: string | null;
  private animationController: TimeAnimationController;
  private animationTime: number;
  private lastAnimationCameraPitched: boolean | null;
  private stickyTooltipContent: VisualTooltipContent | null;
  private stickyTooltipExpiresAt: number;
  private stickyTooltipHideTimeout: number | null;
  private tooltipElement: HTMLElement | null;
  private tooltipPointerInside: boolean;

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

  private createTimeSliderControl(): MapOverlayControl {
    const container = document.createElement("div");
    container.className =
      "maplibregl-ctrl deckgl-time-slider deckgl-time-slider--hidden";
    container.setAttribute("aria-label", "Time slider");

    // Keep slider drags/clicks from panning or zooming the map.
    const stopPropagation = (event: Event) => event.stopPropagation();
    for (const type of ["mousedown", "dblclick", "wheel"]) {
      container.addEventListener(type, stopPropagation);
    }

    const makeButton = (label: string, title: string): HTMLButtonElement => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "deckgl-time-slider__button";
      button.title = title;
      button.setAttribute("aria-label", title);
      const span = document.createElement("span");
      span.setAttribute("aria-hidden", "true");
      span.textContent = label;
      button.appendChild(span);
      return button;
    };

    const skipBackButton = makeButton("⏪", "Step backward");
    const playButton = makeButton("▶", "Play");
    const skipForwardButton = makeButton("⏩", "Step forward");

    const speedButton = makeButton("", "Playback speed (click to change)");
    speedButton.classList.add("deckgl-time-slider__speed");

    const range = document.createElement("input");
    range.type = "range";
    range.className = "deckgl-time-slider__range";
    range.min = "0";
    range.max = "1";
    range.step = "1";
    range.value = "0";
    range.setAttribute("aria-label", "Animation time");

    const label = document.createElement("span");
    label.className = "deckgl-time-slider__label";

    container.append(
      skipBackButton,
      playButton,
      skipForwardButton,
      range,
      label,
      speedButton,
    );

    const getSkipStep = (): number => {
      const domain = this.dataset.timeDomain;
      if (!domain) {
        return 1;
      }
      return Math.max(1, (domain.t1 - domain.t0) / 20);
    };

    skipBackButton.onclick = () => {
      this.animationController.seek(
        this.animationController.getTime() - getSkipStep(),
      );
    };
    skipForwardButton.onclick = () => {
      this.animationController.seek(
        this.animationController.getTime() + getSkipStep(),
      );
    };
    playButton.onclick = () => {
      this.setPlaying(!this.animationController.isPlaying());
      this.renderTimeSliderControl();
    };
    range.oninput = () => {
      // Scrubbing pauses playback, mirroring the source TimeSlider.
      if (this.animationController.isPlaying()) {
        this.setPlaying(false);
      }
      this.animationController.seek(Number(range.value));
    };
    speedButton.onclick = () => {
      const current = this.formattingSettings.animation.animationDuration.value;
      this.setAnimationDuration(this.nextAnimationDuration(current));
      this.renderTimeSliderControl();
    };

    // render() runs on every animation frame, so only touch the DOM when a
    // value actually changes. In particular the label uses Intl date formatting
    // (~tens of microseconds), which is wasteful to recompute 60x/second.
    const playSpan = playButton.firstChild as HTMLSpanElement | null;
    let lastT0: number | null = null;
    let lastT1: number | null = null;
    let lastRangeValue: string | null = null;
    let lastLabelTime: number | null = null;
    let lastLabelRealMs = 0;
    let lastPlaying: boolean | null = null;
    let lastSpeed: number | null = null;

    const render = () => {
      const domain = this.dataset.timeDomain;
      const shouldShow =
        this.formattingSettings.layerControls.showTimeSlider.value === true &&
        domain !== null;

      container.classList.toggle("deckgl-time-slider--hidden", !shouldShow);
      if (!shouldShow || !domain) {
        return;
      }

      const time = this.animationController.getTime();
      if (domain.t0 !== lastT0) {
        range.min = String(domain.t0);
        lastT0 = domain.t0;
      }
      if (domain.t1 !== lastT1) {
        range.max = String(domain.t1);
        lastT1 = domain.t1;
      }
      // Reflect the playhead unless the user is mid-drag on this element.
      if (document.activeElement !== range) {
        const nextValue = String(time);
        if (nextValue !== lastRangeValue) {
          range.value = nextValue;
          lastRangeValue = nextValue;
        }
      }
      const playing = this.animationController.isPlaying();

      // The label is human-readable text and Intl date formatting is costly to
      // run every frame. During playback, throttle reformatting to ~4 Hz of
      // wall-clock time (vs 60 Hz). When paused, scrub/step are discrete and
      // low-frequency, so always reflect the exact playhead with no lag.
      const nowMs =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const labelChanged = time !== lastLabelTime;
      const shouldReformat =
        lastLabelTime === null ||
        (labelChanged && (!playing || nowMs - lastLabelRealMs >= 250));
      if (shouldReformat) {
        label.textContent = formatAnimationTime(time);
        lastLabelTime = time;
        lastLabelRealMs = nowMs;
      }
      if (playing !== lastPlaying) {
        if (playSpan) {
          playSpan.textContent = playing ? "⏸" : "▶";
        }
        playButton.title = playing ? "Pause" : "Play";
        playButton.setAttribute("aria-label", playButton.title);
        lastPlaying = playing;
      }

      const animation = this.formattingSettings.animation;
      const durationMode = this.isDurationMode(animation);
      // In duration mode the on-map control represents the full-pass time; show
      // that (e.g. "30s"). In multiplier mode show the raw ×multiplier.
      const speed = durationMode
        ? animation.animationDuration.value
        : animation.animationSpeed.value;
      if (speed !== lastSpeed) {
        const label = durationMode ? `${speed}s` : `${speed}×`;
        const speedSpan = speedButton.firstChild as HTMLSpanElement | null;
        if (speedSpan) {
          speedSpan.textContent = label;
        }
        speedButton.title = durationMode
          ? `Full animation: ${speed}s (click for faster)`
          : `Playback speed ${speed}× (click to change)`;
        speedButton.setAttribute("aria-label", speedButton.title);
        lastSpeed = speed;
      }
    };

    return {
      onAdd: () => {
        render();
        return container;
      },
      onRemove: () => {
        skipBackButton.onclick = null;
        skipForwardButton.onclick = null;
        playButton.onclick = null;
        speedButton.onclick = null;
        range.oninput = null;
        for (const type of ["mousedown", "dblclick", "wheel"]) {
          container.removeEventListener(type, stopPropagation);
        }
        container.replaceChildren();
        container.remove();
      },
      render,
    };
  }

  private renderTimeSliderControl() {
    this.timeSliderControl?.render();
  }

  private handleAnimationPlaybackComplete() {
    syncCompletedAnimationPlayback(this.formattingSettings.animation, this.host);
    this.renderTimeSliderControl();
  }

  /**
   * Toggle playback from an on-map control. Drives the controller, keeps the
   * in-memory Animation `play` setting in sync, and persists it so the format
   * pane reflects the change and a later update() does not stop playback by
   * re-reading a stale persisted value.
   */
  private setPlaying(play: boolean) {
    if (play) {
      this.animationController.play();
    } else {
      this.animationController.pause();
    }
    if (this.formattingSettings.animation.play.value === play) {
      return;
    }
    this.formattingSettings.animation.play.value = play;
    this.host.persistProperties({
      merge: [
        {
          objectName: "animationProps",
          selector: null,
          properties: { play },
        },
      ],
    });
  }

  /**
   * Full-pass durations (seconds) the on-map speed button cycles through,
   * slow -> fast. These are domain-relative: a smaller duration plays the whole
   * time span faster, regardless of how many years the data spans.
   */
  private static readonly DURATION_PRESETS = [120, 60, 30, 15, 8, 4];

  /** True when the report is using duration speed mode. */
  private isDurationMode(animation: AnimationCardSettings): boolean {
    return animation.speedMode.value.value === ANIMATION_SPEED_MODE_DURATION;
  }

  /**
   * Effective sim-sec/real-sec speed for the controller, derived from the speed
   * mode: domain-fitted in duration mode, or the raw multiplier otherwise.
   */
  private effectiveAnimationSpeed(
    animation: AnimationCardSettings,
    domain: { t0: number; t1: number } | null,
  ): number {
    return resolveAnimationSpeed({
      durationMode: this.isDurationMode(animation),
      durationSeconds: animation.animationDuration.value,
      multiplier: animation.animationSpeed.value,
      domain,
    });
  }

  /**
   * Set the full-pass duration from the on-map control. Always drives duration
   * mode (flipping speedMode if the report was in multiplier mode), reconfigures
   * the controller against the current domain, keeps the settings in sync, and
   * persists both so the format pane reflects the change and a later update()
   * does not revert it.
   */
  private setAnimationDuration(duration: number) {
    const animation = this.formattingSettings.animation;
    const alreadyDuration = this.isDurationMode(animation);
    if (alreadyDuration && animation.animationDuration.value === duration) {
      return;
    }
    animation.speedMode.value = ANIMATION_SPEED_MODE_ITEMS[0];
    animation.animationDuration.value = duration;
    this.animationController.setConfig({
      animationSpeed: this.effectiveAnimationSpeed(
        animation,
        this.dataset.timeDomain,
      ),
      loop: animation.loop.value,
    });
    this.host.persistProperties({
      merge: [
        {
          objectName: "animationProps",
          selector: null,
          properties: {
            speedMode: ANIMATION_SPEED_MODE_DURATION,
            animationDuration: duration,
          },
        },
      ],
    });
  }

  /** Next duration preset below the current value (faster), wrapping to slowest. */
  private nextAnimationDuration(current: number): number {
    const presets = Visual.DURATION_PRESETS;
    const next = presets.find((p) => p < current);
    return next ?? presets[0];
  }

  private handleCameraPitchChanged() {
    const isPitched = this.isCameraPitched();
    if (this.lastAnimationCameraPitched === isPitched) {
      return;
    }

    this.lastAnimationCameraPitched = isPitched;
    if (!this.isAnimationAvailable()) {
      return;
    }

    this.pushAnimationFrame();
  }

  private isDarkBaseMap(baseMap: string): boolean {
    return resolveBasemap(baseMap).dark;
  }

  private syncBaseMapTheme(baseMap: string) {
    this.rootElement.classList.toggle(
      "deckgl-map-visual--dark-basemap",
      this.isDarkBaseMap(baseMap),
    );
  }

  private getBasemapStyleOptions() {
    const mapSettings = this.formattingSettings.map;

    return {
      mapboxAccessToken: mapSettings.mapboxAccessToken.value,
      aerialOpacity: mapSettings.aerialBasemapOpacity.value,
    };
  }

  private getCurrentBasemapStyleSignature(baseMap: string): string {
    return getBasemapStyleSignature(
      baseMap,
      this.formattingSettings.map.mapboxAccessToken.value,
    );
  }

  private getCurrentRasterBasemapOpacity(): number {
    const baseMap = this.formattingSettings.map.baseMap.value.value as string;

    if (!resolveBasemap(baseMap).isAerial) {
      return 1;
    }

    return clampAerialBasemapOpacity(
      this.formattingSettings.map.aerialBasemapOpacity.value,
    );
  }

  private syncRasterBasemapOpacity() {
    const map = this.map as any;

    if (!map?.isStyleLoaded?.() || !map.getLayer?.(BASEMAP_RASTER_LAYER_ID)) {
      return;
    }

    const opacity = this.getCurrentRasterBasemapOpacity();
    const currentOpacity = map.getPaintProperty?.(
      BASEMAP_RASTER_LAYER_ID,
      "raster-opacity",
    );

    if (
      typeof currentOpacity === "number" &&
      Math.abs(currentOpacity - opacity) < RASTER_OPACITY_EPSILON
    ) {
      return;
    }

    map.setPaintProperty?.(
      BASEMAP_RASTER_LAYER_ID,
      "raster-opacity",
      opacity,
    );
  }

  private is3DBuildingsEnabled(): boolean {
    return this.formattingSettings.map.show3DBuildings.value === true;
  }

  private get3DBuildingsMinZoom(): number {
    return clamp3DBuildingsMinZoom(
      this.formattingSettings.map.buildingsMinZoom.value,
    );
  }

  private get3DBuildingsLayerSignature(): string {
    return this.is3DBuildingsEnabled()
      ? `on:${this.get3DBuildingsMinZoom()}`
      : "off";
  }

  private remove3DBuildingsLayer() {
    const map = this.map as any;

    if (!map) {
      return;
    }

    if (map.getLayer?.(BUILDINGS_LAYER_ID)) {
      map.removeLayer?.(BUILDINGS_LAYER_ID);
    }

    if (map.getSource?.(BUILDINGS_SOURCE_ID)) {
      map.removeSource?.(BUILDINGS_SOURCE_ID);
    }
  }

  private sync3DBuildingsLayer() {
    const map = this.map as any;

    if (!map?.isStyleLoaded?.()) {
      return;
    }

    const signature = this.get3DBuildingsLayerSignature();
    const hasLayer = !!map.getLayer?.(BUILDINGS_LAYER_ID);
    const hasSource = !!map.getSource?.(BUILDINGS_SOURCE_ID);

    if (!this.is3DBuildingsEnabled()) {
      if (hasLayer || hasSource) {
        this.remove3DBuildingsLayer();
      }
      this.buildingLayerSignature = signature;
      return;
    }

    if (hasLayer && hasSource && this.buildingLayerSignature === signature) {
      return;
    }

    if (hasLayer) {
      map.removeLayer?.(BUILDINGS_LAYER_ID);
    }

    if (!hasSource) {
      map.addSource?.(BUILDINGS_SOURCE_ID, create3DBuildingsSource());
    }

    const labelLayerId = getFirstSymbolLayerId(map.getStyle?.().layers ?? []);
    const buildingsLayer = create3DBuildingsLayer(
      this.get3DBuildingsMinZoom(),
    );

    if (labelLayerId) {
      map.addLayer?.(buildingsLayer, labelLayerId);
    } else {
      map.addLayer?.(buildingsLayer);
    }

    this.buildingLayerSignature = signature;
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
    // Auto-tilt only when there is real height to show. The bare Extruded
    // toggle no longer tilts the camera on its own — with no elevation it would
    // just extrude to 0 height.
    const polygonHasHeight =
      this.dataset.elevationFieldBound ||
      this.dataset.layers.polygon.some((feature) => feature.hasZ);
    const extrudedPolygonLayerShown =
      polygonHasHeight &&
      this.dataset.layers.polygon.length > 0 &&
      visibleGeometryTypes.has("polygon");
    const elevatedScatterLayerShown =
      this.dataset.scatterHasVisibleElevation &&
      this.dataset.layers.scatter.length > 0 &&
      visibleGeometryTypes.has("scatter");
    const arcLayerShown =
      visibleGeometryTypes.has("arc") && this.hasRenderableArcData();

    // Note: Show 3D buildings is deliberately NOT a tilt trigger. Buildings
    // still render extruded, but they only read on a tilted camera, and forcing
    // a tilt whenever the toggle is on (e.g. on a flat scatter/heatmap map)
    // breaks the 2D-by-default rule. Tilt manually to see the buildings in 3D.
    return extrudedPolygonLayerShown || elevatedScatterLayerShown || arcLayerShown;
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

  /** True when a timestamp is bound and there is a usable time domain. */
  private isAnimationAvailable(): boolean {
    return this.dataset.timeDomain !== null;
  }

  /** True when the camera is tilted off top-down (a 3D trigger or manual tilt). */
  private isCameraPitched(): boolean {
    const pitch = this.getMapPitch();
    return pitch !== null && pitch > PITCH_EPSILON;
  }

  /**
   * Build the per-frame animation context, or null when no timestamp is bound
   * (layers then render exactly as before).
   */
  private getAnimationContext(): AnimationContext | null {
    const domain = this.dataset.timeDomain;
    if (!domain) {
      return null;
    }
    const animation = this.formattingSettings.animation;
    const time = Math.min(
      domain.t1,
      Math.max(domain.t0, this.animationTime),
    );
    // Time-as-height only reads on a tilted map; on a top-down view the lifted
    // points project straight down and just look like a 2D scatter that has
    // drifted off its coordinates. Keep the default view genuinely 2D by zeroing
    // the derived height until the camera is pitched (an extrusion/arc/building
    // trigger, or a manual tilt). The user opts into time-as-height by tilting.
    const maxHeight = this.isCameraPitched()
      ? Math.max(0, animation.maxHeight.value)
      : 0;
    return {
      active: true,
      domain,
      time,
      trailLength: Math.max(0, animation.trailLength.value),
      maxHeight,
    };
  }

  private getTooltipBounds(): TooltipPlacementBounds | null {
    const canvas = this.map?.getCanvas?.();
    const canvasWidth = canvas?.clientWidth ?? 0;
    const canvasHeight = canvas?.clientHeight ?? 0;

    if (canvasWidth > 0 && canvasHeight > 0) {
      return {
        width: canvasWidth,
        height: canvasHeight,
      };
    }

    const rootRect = this.rootElement.getBoundingClientRect();
    if (rootRect.width > 0 && rootRect.height > 0) {
      return {
        width: rootRect.width,
        height: rootRect.height,
      };
    }

    return null;
  }

  private getDynamicTooltipStyle(
    hoverInfo: PickingInfo,
    maxWidth: number,
    baseStyle: Partial<CSSStyleDeclaration>,
  ): Partial<CSSStyleDeclaration> {
    return {
      ...baseStyle,
      pointerEvents: "auto",
      ...getTooltipPlacementStyle({
        x: hoverInfo.x,
        y: hoverInfo.y,
        bounds: this.getTooltipBounds(),
        maxWidth,
      }),
    };
  }

  private clearTooltipHideTimeout(): void {
    if (this.stickyTooltipHideTimeout === null) {
      return;
    }

    window.clearTimeout(this.stickyTooltipHideTimeout);
    this.stickyTooltipHideTimeout = null;
  }

  private detachTooltipListeners(): void {
    if (!this.tooltipElement) {
      return;
    }

    this.tooltipElement.removeEventListener(
      "mouseenter",
      this.handleTooltipMouseEnter,
    );
    this.tooltipElement.removeEventListener(
      "mouseleave",
      this.handleTooltipMouseLeave,
    );
    this.tooltipElement.removeEventListener(
      "pointerdown",
      this.stopTooltipEvent,
    );
    this.tooltipElement.removeEventListener("mousedown", this.stopTooltipEvent);
    this.tooltipElement.removeEventListener("mouseup", this.stopTooltipEvent);
    this.tooltipElement.removeEventListener("click", this.stopTooltipEvent);
    this.tooltipElement.removeEventListener("dblclick", this.stopTooltipEvent);
    this.tooltipElement.removeEventListener("wheel", this.stopTooltipEvent);
    this.tooltipElement = null;
  }

  private ensureTooltipInteractivity(): void {
    const element = this.rootElement.querySelector<HTMLElement>(".deck-tooltip");
    if (!element) {
      this.detachTooltipListeners();
      return;
    }

    if (this.tooltipElement === element) {
      return;
    }

    this.detachTooltipListeners();
    this.tooltipElement = element;
    element.addEventListener("mouseenter", this.handleTooltipMouseEnter);
    element.addEventListener("mouseleave", this.handleTooltipMouseLeave);
    element.addEventListener("pointerdown", this.stopTooltipEvent);
    element.addEventListener("mousedown", this.stopTooltipEvent);
    element.addEventListener("mouseup", this.stopTooltipEvent);
    element.addEventListener("click", this.stopTooltipEvent);
    element.addEventListener("dblclick", this.stopTooltipEvent);
    element.addEventListener("wheel", this.stopTooltipEvent);
  }

  private hideStickyTooltip(): void {
    this.clearTooltipHideTimeout();
    this.stickyTooltipContent = null;
    this.stickyTooltipExpiresAt = 0;
    this.tooltipPointerInside = false;

    const element =
      this.tooltipElement ??
      this.rootElement.querySelector<HTMLElement>(".deck-tooltip");
    if (element) {
      element.style.display = "none";
    }
  }

  private scheduleStickyTooltipHide(
    delayMs = TOOLTIP_INTERACTION_HIDE_DELAY_MS,
  ): void {
    this.clearTooltipHideTimeout();
    this.stickyTooltipExpiresAt = Date.now() + delayMs;
    this.stickyTooltipHideTimeout = window.setTimeout(() => {
      this.stickyTooltipHideTimeout = null;
      if (!this.tooltipPointerInside && Date.now() >= this.stickyTooltipExpiresAt) {
        this.hideStickyTooltip();
      }
    }, delayMs);
  }

  private rememberStickyTooltip(
    content: VisualTooltipContent,
  ): VisualTooltipContent {
    this.ensureTooltipInteractivity();
    this.clearTooltipHideTimeout();
    this.stickyTooltipContent = content;
    this.stickyTooltipExpiresAt =
      Date.now() + TOOLTIP_INTERACTION_HIDE_DELAY_MS;
    return content;
  }

  private getStickyTooltipFallback(): VisualTooltipContent | null {
    this.ensureTooltipInteractivity();
    if (!this.stickyTooltipContent) {
      return null;
    }

    if (this.tooltipPointerInside) {
      return this.stickyTooltipContent;
    }

    const remainingMs = this.stickyTooltipExpiresAt - Date.now();
    if (remainingMs <= 0) {
      this.hideStickyTooltip();
      return null;
    }

    if (this.stickyTooltipHideTimeout === null) {
      this.scheduleStickyTooltipHide(remainingMs);
    }
    return this.stickyTooltipContent;
  }

  private detachTooltipInteractivity(): void {
    this.clearTooltipHideTimeout();
    this.stickyTooltipContent = null;
    this.stickyTooltipExpiresAt = 0;
    this.tooltipPointerInside = false;
    this.detachTooltipListeners();
  }

  private handleTooltipMouseEnter = (): void => {
    this.tooltipPointerInside = true;
    this.clearTooltipHideTimeout();
  };

  private handleTooltipMouseLeave = (): void => {
    this.tooltipPointerInside = false;
    if (this.stickyTooltipContent) {
      this.scheduleStickyTooltipHide();
    }
  };

  private stopTooltipEvent = (event: Event): void => {
    event.stopPropagation();
  };

  /**
   * Sync the animation controller with the current dataset and settings, and
   * start/stop playback to match the Play toggle. Called on each data/format
   * update (not per frame).
   */
  private syncAnimationController(): void {
    const domain = this.dataset.timeDomain;
    this.animationController.setDomain(domain);
    if (!domain) {
      this.animationTime = 0;
      return;
    }
    const animation = this.formattingSettings.animation;
    this.animationController.setConfig({
      animationSpeed: this.effectiveAnimationSpeed(animation, domain),
      loop: animation.loop.value,
    });
    this.animationTime = this.animationController.getTime();
    if (animation.play.value) {
      this.animationController.play();
    } else {
      this.animationController.pause();
    }
  }

  private setCurrentDeckLayers(
    layers: any[],
    layerDrawOrder: RenderableGeometryType[],
    activeGeometryTypes: Set<RenderableGeometryType>,
  ): void {
    this.currentDeckLayers = layers;
    this.currentLayerDrawOrder = layerDrawOrder;
    this.currentActiveGeometryTypes = activeGeometryTypes;
    this.currentActiveLayerIds = getActiveDeckLayerIds(layers);
    this.deckOverlay?.setProps({ layers });
  }

  /**
   * Re-render with the advanced playhead. Normal renders cache the full layer
   * list; animation ticks clone only temporal scatter/path layers with updated
   * uniforms and reuse all static layer objects.
   */
  private pushAnimationFrame(): void {
    if (!this.deckOverlay) {
      return;
    }

    const animation = this.getAnimationContext();
    if (!animation || this.currentDeckLayers.length === 0) {
      this.renderCurrentState();
      return;
    }

    const { layers, changed } = updateTemporalAnimationLayers(
      this.currentDeckLayers,
      animation,
    );

    if (!changed) {
      return;
    }

    this.currentDeckLayers = layers;
    this.currentActiveLayerIds = getActiveDeckLayerIds(layers);
    this.deckOverlay.setProps({ layers });
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

  private isMultiSelectEvent(event: unknown): boolean {
    const rootEvent = asModifierKeyEvent(event);
    const originalEvent = asModifierKeyEvent(rootEvent?.originalEvent);
    const srcEvent = asModifierKeyEvent(rootEvent?.srcEvent);
    const sourceEvent = asModifierKeyEvent(rootEvent?.sourceEvent);
    const candidates = [
      rootEvent,
      originalEvent,
      srcEvent,
      sourceEvent,
      asModifierKeyEvent(originalEvent?.srcEvent),
      asModifierKeyEvent(srcEvent?.originalEvent),
      asModifierKeyEvent(sourceEvent?.originalEvent),
      asModifierKeyEvent(sourceEvent?.srcEvent),
    ];
    return candidates.some((ev) => !!(ev && (ev.ctrlKey || ev.metaKey)));
  }

  private syncScatterSymbolSettingFromMetadata(dataView: powerbi.DataView) {
    const objects = dataView.metadata?.objects as
      | Record<string, Record<string, unknown>>
      | undefined;
    const rawSymbolType =
      objects?.scatterProps?.symbolType ??
      this.formattingSettings.scatter.symbolType.value;
    const symbolType = getScatterSymbolType(rawSymbolType);
    this.formattingSettings.scatter.symbolType.value = {
      value: symbolType,
      displayName: getScatterSymbol(symbolType).displayName,
    };
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
    this.map = null;
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
    this.lastParseHadTimestampRole = false;
    this.dataVersionCounter = 0;
    this.currentActiveGeometryTypes = new Set();
    this.currentLayerDrawOrder = [...DEFAULT_LAYER_DRAW_ORDER];
    this.currentDeckLayers = [];
    this.currentActiveLayerIds = [];
    this.layerOrderControl = null;
    this.timeSliderControl = null;
    this.lastPerspectiveLayerShown = null;
    this.automaticPitchOwned = false;
    this.buildingLayerSignature = null;
    this.animationTime = 0;
    this.lastAnimationCameraPitched = null;
    this.stickyTooltipContent = null;
    this.stickyTooltipExpiresAt = 0;
    this.stickyTooltipHideTimeout = null;
    this.tooltipElement = null;
    this.tooltipPointerInside = false;
    this.animationController = new TimeAnimationController((time) => {
      this.animationTime = time;
      this.pushAnimationFrame();
      // Keep the time-slider thumb/label tracking autoplay.
      this.renderTimeSliderControl();
    }, undefined, undefined, undefined, () =>
      this.handleAnimationPlaybackComplete(),
    );
    this.rootElement = options.element;

    const settings =
      this.formattingSettingsService.populateFormattingSettingsModel(
        VisualFormattingSettingsModel,
        null,
      );
    this.formattingSettings = settings;
    this.currentBaseMap = settings.map.baseMap.value.value as string;
    this.currentBaseMapStyleSignature = this.getCurrentBasemapStyleSignature(
      this.currentBaseMap,
    );
    this.syncBaseMapTheme(this.currentBaseMap);

    if (document) {
      this.rootElement.classList.add("deckgl-map-visual");
      this.map = new MapLibreMap({
        container: this.rootElement,
        style: getBasemapStyle(
          settings.map.baseMap.value.value,
          this.getBasemapStyleOptions(),
        ) as any,
        canvasContextAttributes: { antialias: true },
        maxZoom: 20,
      });
      this.map.on("styledata", () => {
        this.syncRasterBasemapOpacity();
        this.sync3DBuildingsLayer();
      });
      this.map.on("pitch", () => this.handleCameraPitchChanged());
      this.map.on("pitchend", () => this.handleCameraPitchChanged());
      this.legendContainer = document.createElement("div");
      this.legendContainer.className =
        "deckgl-gradient-legend deckgl-gradient-legend--hidden";
      this.rootElement.appendChild(this.legendContainer);
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
            // Show the current playhead time only while actively playing.
            const animationHtml = this.animationController.isPlaying()
              ? getAnimationTimeTooltipHtml(this.getAnimationContext())
              : null;

            const h3TooltipHtml = getH3HexagonTooltipHtml(hoverInfo);
            if (h3TooltipHtml) {
              const tooltipContent = {
                html: animationHtml
                  ? animationHtml + h3TooltipHtml
                  : h3TooltipHtml,
                style: this.getDynamicTooltipStyle(
                  hoverInfo,
                  H3_TOOLTIP_MAX_WIDTH_PX,
                  {
                    zIndex: "2",
                    color: "#dbe6ef",
                    backgroundColor: "#29323c",
                    padding: "8px 10px",
                    borderRadius: "4px",
                    margin: "0px",
                    fontSize: "12px",
                  },
                ),
              };
              return this.rememberStickyTooltip(tooltipContent);
            }

            const tooltipHtml = getAggregatedTooltipHtml({
              hoverInfo,
              deckOverlay: this.deckOverlay,
              drawOrder: this.currentLayerDrawOrder,
              activeTypes: this.currentActiveGeometryTypes,
              layerIds: this.getActiveLayerIds(),
              radius: 5,
              depth: 25,
            });

            // Don't float a lone time banner when nothing is actually hovered.
            if (!tooltipHtml && (!animationHtml || !hoverInfo?.object)) {
              return this.getStickyTooltipFallback();
            }

            const combined = animationHtml
              ? animationHtml + (tooltipHtml ?? "")
              : (tooltipHtml ?? "");

            if (!combined) {
              return this.getStickyTooltipFallback();
            }

            const tooltipContent = {
              html: combined,
              style: this.getDynamicTooltipStyle(
                hoverInfo,
                MULTI_TOOLTIP_MAX_WIDTH_PX,
                {
                  zIndex: "2",
                  color: "#a0a7b4",
                  backgroundColor: "#29323c",
                  padding: "0px",
                  borderRadius: "4px",
                  margin: "0px",
                  fontSize: "12px",
                },
              ),
            };
            return this.rememberStickyTooltip(tooltipContent);
          },
        });
        this.map.addControl(this.deckOverlay);
        this.map.addControl(new NavigationControl());
        this.map.addControl(this.createResetViewControl(), "top-left");
        this.layerOrderControl = this.createLayerOrderControl();
        this.map.addControl(this.layerOrderControl, "bottom-right");
        this.timeSliderControl = this.createTimeSliderControl();
        this.map.addControl(this.timeSliderControl, "bottom-left");
        this.sync3DBuildingsLayer();

        const pendingOptions = this.pendingOptions;
        this.pendingOptions = null;
        if (pendingOptions) {
          this.update(pendingOptions);
        }
      });
    }
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
    return getDataViewSignature(dataView);
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

    // Self-heal: if a timestamp role became bound since the last parse, force a
    // re-parse even if the data-view signature did not otherwise change. This
    // recovers the animation when a timestamp field is added after the first
    // render (Power BI may deliver it without flagging a data update). Gated on
    // "newly bound" so an empty-but-bound timestamp does not re-parse forever.
    if (
      dataViewHasRole(dataView, "timestamp") &&
      !this.lastParseHadTimestampRole
    ) {
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
    const newBaseMapStyleSignature =
      this.getCurrentBasemapStyleSignature(newBaseMap);
    this.syncBaseMapTheme(newBaseMap);
    if (newBaseMapStyleSignature !== this.currentBaseMapStyleSignature) {
      this.buildingLayerSignature = null;
      this.map?.setStyle?.(
        getBasemapStyle(newBaseMap, this.getBasemapStyleOptions()) as any,
      );
      this.currentBaseMap = newBaseMap;
      this.currentBaseMapStyleSignature = newBaseMapStyleSignature;
    } else {
      this.currentBaseMap = newBaseMap;
      this.syncRasterBasemapOpacity();
      this.sync3DBuildingsLayer();
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
    this.hideStickyTooltip();
    this.dataVersionCounter += 1;
    this.animationController.setDomain(null);
    this.animationTime = 0;
    this.dataset = createEmptyDatasetSnapshot(String(this.dataVersionCounter));
    this.dataPoints = this.dataset.layers.all;
    this.selectedIds.clear();
    this.lastDataSignature = null;
    this.lastParseHadTimestampRole = false;
    this.lastLegendSignature = null;
    this.hasInitialViewBeenSet = false;
    this.currentActiveGeometryTypes = new Set();
    this.currentLayerDrawOrder = [...DEFAULT_LAYER_DRAW_ORDER];
    this.currentDeckLayers = [];
    this.currentActiveLayerIds = [];
    this.deckOverlay?.setProps({ layers: [] });
    if (this.legendContainer) {
      renderGradientLegend(
        this.legendContainer,
        [],
        this.getGradientLegendRenderOptions(),
      );
    }
    this.renderLayerOrderControl();
    this.renderTimeSliderControl();
    this.updateOverlayLayout();
    this.applyAutomaticPitch();
  }

  private processData(options: VisualUpdateOptions, dataView: powerbi.DataView) {
    this.hideStickyTooltip();
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
      this.lastParseHadTimestampRole = dataViewHasRole(dataView, "timestamp");
      this.pruneSelectionToVisibleIds();
      if (this.dataPoints.length === 0) {
        this.hasInitialViewBeenSet = false;
      }
    });
  }

  public onClick = (info: PickingInfo, event: unknown) => {
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
    return this.currentActiveLayerIds;
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

  private buildDeckLayers(): {
    layers: any[];
    layerDrawOrder: RenderableGeometryType[];
    activeGeometryTypes: Set<RenderableGeometryType>;
  } {
    {
      const visualSelectedIds = this.getVisualSelectedIds();
      const selectedSignature = this.getSetSignature(visualSelectedIds);
      const settings = this.formattingSettings;
      const layerData = this.dataset.layers;
      const layerDrawOrder = this.getLayerDrawOrder();
      const activeGeometryTypes = new Set<RenderableGeometryType>();
      const animation = this.getAnimationContext();
      const layers = [];

      for (const geometryType of layerDrawOrder) {
        if (layerData[geometryType].length === 0) {
          continue;
        }

        activeGeometryTypes.add(geometryType);

        if (geometryType === "scatter") {
          const showHeatmap = settings.heatmap.showHeatmap.value === true;
          const showH3Hexagons =
            settings.h3Hexagon.showH3Hexagons.value === true;
          const showScatterPoints =
            (!showHeatmap ||
              settings.heatmap.showScatterPoints.value === true) &&
            (!showH3Hexagons ||
              settings.h3Hexagon.showScatterPoints.value === true);

          if (showHeatmap) {
            layers.push(getHeatmapLayer(layerData.scatter, settings.heatmap));
          }

          if (showH3Hexagons) {
            layers.push(
              getH3HexagonLayer(
                layerData.scatter,
                settings.h3Hexagon,
                this.classificationCache,
                this.dataset.version,
              ),
            );
          }

          if (showScatterPoints) {
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
                animation,
              ),
            );
          }
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
              animation,
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

      return { layers, layerDrawOrder, activeGeometryTypes };
    }
  }

  private renderCurrentState(dataView = this.lastOptions?.dataViews?.[0]) {
    if (!this.deckOverlay) {
      return;
    }

    this.measureTask("powerbi-deckgl-map:render", () => {
      const { layers, layerDrawOrder, activeGeometryTypes } =
        this.buildDeckLayers();
      this.setCurrentDeckLayers(layers, layerDrawOrder, activeGeometryTypes);
      this.renderLayerOrderControl();
      this.renderTimeSliderControl();
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
      this.syncScatterSymbolSettingFromMetadata(dataView);
    }
    this.updateBaseMap();
    this.renderLayerOrderControl();
    this.renderTimeSliderControl();
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
      this.syncAnimationController();
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

    this.syncAnimationController();
    this.renderCurrentState(dataView);
    this.applyAutomaticPitch();
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    // Hide the Animation card unless a timestamp is bound, so its controls
    // don't appear when they cannot do anything.
    this.formattingSettings.animation.visible = this.isAnimationAvailable();
    // Show only the classification inputs that apply to each gradient's
    // selected method, so irrelevant boxes don't appear in the pane.
    this.formattingSettings.applyConditionalVisibility();
    return this.formattingSettingsService.buildFormattingModel(
      this.formattingSettings,
    );
  }

  public destroy(): void {
    this.pendingOptions = null;
    this.animationController.stop();
    this.hideStickyTooltip();
    this.detachTooltipInteractivity();
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
    this.timeSliderControl = null;
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
