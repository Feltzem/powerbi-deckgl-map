"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import VisualDataChangeOperationKind = powerbi.VisualDataChangeOperationKind;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;


import { MapCardSettings, VisualFormattingSettingsModel } from "./settings";
import { Map } from 'maplibre-gl';
import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox';
import { NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createSelectorDataPoints } from "./mapper";

import { getPointsFromData, OurData } from "./dataPoint";
import getScatterLayer from "./layers/scatter";
import getLineLayer from "./layers/line";
import getArcLayer from "./layers/arc";
import getPathLayer from "./layers/path";
import getPolygonLayer from "./layers/polygon";
import { } from "./settings"
import { InputGeometryType } from "./enum";


export class Visual implements IVisual {
    private host: IVisualHost;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private map: any;
    private selectionManager: powerbi.extensibility.ISelectionManager;
    private dataPoints: OurData[];
    private deckOverlay: DeckOverlay | null;
    private decodeCache: {};
    private selectedIds: string[];
    private lastOptions: VisualUpdateOptions | null;
    private hasManuallyBeenNavigated: boolean;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.selectionManager = options.host.createSelectionManager();
        const localizationManager = this.host.createLocalizationManager();
        this.formattingSettingsService = new FormattingSettingsService(localizationManager);
        this.dataPoints = [];
        this.deckOverlay = null;
        this.decodeCache = {};
        this.selectedIds = [];
        this.hasManuallyBeenNavigated = false;

        if (document) {
            this.map = new Map({
                container: options.element,
                style: {
                    'version': 8,
                    'sources': {
                        'raster-tiles': {
                            'type': 'raster',
                            'tiles': [
                                // "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                                'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                                'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                                'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                                'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',

                            ],
                            'tileSize': 256,
                            'attribution':
                                // 'Map tiles by <a target="_blank" href="https://stamen.com">Stamen Design</a>; Hosting by <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a>. Data &copy; <a href="https://www.openstreetmap.org/about" target="_blank">OpenStreetMap</a> contributors'
                                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',

                        }
                    },
                    'layers': [
                        {
                            'id': 'simple-tiles',
                            'type': 'raster',
                            'source': 'raster-tiles',
                            'minzoom': 0,
                            'maxzoom': 20,
                        }
                    ]
                },
                canvasContextAttributes: { antialias: true },
                maxZoom: 20 // To match tiles

            });
            this.map.on('error', (e) => {
                console.log("Error", e);
            });
            this.map.on('load', () => {
                console.log("Loaded");
                this.hasManuallyBeenNavigated = false;
                this.deckOverlay = new DeckOverlay({
                    interleaved: true,
                    layers: [],
                    getCursor: ({ isHovering, isDragging }) => (isHovering ? "pointer" : (isDragging ? 'grabbing' : 'grab')),
                    onClick: () => {
                        // Clear things:
                        console.log("Map clicked - clearing selection");
                        this.selectedIds = [];
                        this.selectionManager.clear();
                        if (this.lastOptions) {
                            this.update(this.lastOptions);
                        }
                    },
                    pickingRadius: 5,
                    getTooltip: (hoverInfo) => hoverInfo.object && hoverInfo.object.tooltipHtml && {
                        html: "<div>" + hoverInfo.object.tooltipHtml + "</div>",
                        style: {
                            "z-index": 2,
                            "color": "#a0a7b4",
                            "background-color": "#29323c",
                            "padding": "2px 5px",
                            "border-radius": "3px",
                            "margin": "0px",
                            "font-size": "12px",
                            "margin-left": "25px", // Offset from the mouse
                        }
                    },
                });
                this.map.on('movestart', () => {
                    console.log("Map move started");
                    this.hasManuallyBeenNavigated = true;
                });
                this.map.addControl(this.deckOverlay);
                this.map.addControl(new NavigationControl());
            })
        }
    }

    public onClick = (info, event) => {
        if (info.object) {
            const multiSelect = (event.srcEvent as MouseEvent).ctrlKey;

            // Filter the selections:
            const id = info.object.id;
            if (this.selectedIds.includes(id)) {
                this.selectedIds = this.selectedIds.filter(x => x !== id);
            } else {
                if (multiSelect) {
                    this.selectedIds.push(id);
                } else {
                    this.selectedIds = [id];
                }
            }

            // Now get the selection IDs of the ones we're selected. (NB: why not use the selection manager and
            // info.object.properties.selectionId? Well, for some reason the selection ID is in an undefined stat)
            this.selectionManager.clear();
            const selectedIds = this.dataPoints.filter(x => this.selectedIds.includes(x.id)).map(x => x.selectionId);
            this.selectionManager.select(selectedIds, false).then((ids) => {
                console.log("Selection IDs after selection manager set them:", ids);
            });

            // Update so we can draw the highlights
            this.update(this.lastOptions);
            return true; // don't propagate the event
        }
    };

    public handleFlyTo(settings: MapCardSettings, dataFilterApplied: boolean) {
        var minLat = 90, maxLat = -90, minLon = 180, maxLon = -180, anyPoints = false;

        // We only fly to if:
        // - We have never been manually navigated
        // - There is a selection *or filter*, and we want to fly to that

        const anySelected = this.selectedIds.length !== 0;
        console.log(`Has manually navigated: ${this.hasManuallyBeenNavigated}, any selected: ${anySelected}, data filter applied: ${dataFilterApplied}`);
        const canFlyTo = anySelected || !this.hasManuallyBeenNavigated || dataFilterApplied;
        if (!canFlyTo) {
            console.log("Not flying to selected because user has manually navigated");
            return;
        }

        this.dataPoints.forEach((d) => {
            // If there's a filter selected, only include those points
            if (anySelected && !this.selectedIds.includes(d.id)) {
                return;
            }
            const points = getPointsFromData(d);
            let n = points.length;
            if (n > 0) {
                anyPoints = true;
            }
            while (n--) {
                let p = points[n],
                    lat = p.lat,
                    lon = p.lon;
                if (lat < minLat) {
                    minLat = lat;
                }
                if (lat > maxLat) {
                    maxLat = lat;
                }
                if (lon < minLon) {
                    minLon = lon;
                }
                if (lon > maxLon) {
                    maxLon = lon;
                }
            }
        });
        console.log(`Data bounds: ${minLat},${minLon} to ${maxLat},${maxLon} (any points: ${anyPoints})`);
        const defaultMinLat = settings.initialSouth.value, defaultMaxLat = settings.initialNorth.value, defaultMinLon = settings.initialWest.value, defaultMaxLon = settings.initialEast.value;
        if (!anyPoints) {
            this.map.fitBounds([[defaultMinLon, defaultMinLat], [defaultMaxLon, defaultMaxLat]], { duration: settings.flyToDuration.value });
        } else {
            // OK, don't bother jumping unless:
            // - The intersection of the bounding box containing data is less than 1% of the map AND the maps looking at greater than 30km horizontally
            // - A data point is within 10% of the current edge of the map
            const bounds = this.map.getBounds();
            const boundsLat0 = bounds.getSouth();
            const boundsLat1 = bounds.getNorth();
            const boundsLon0 = bounds.getWest();
            const boundsLon1 = bounds.getEast();
            // Calculate intersection:
            const intersectionLat0 = Math.max(boundsLat0, minLat);
            const intersectionLat1 = Math.min(boundsLat1, maxLat);
            const intersectionLon0 = Math.max(boundsLon0, minLon);
            const intersectionLon1 = Math.min(boundsLon1, maxLon);
            // OK first condition, zooming in:
            const intersectionArea = (intersectionLat1 - intersectionLat0) * (intersectionLon1 - intersectionLon0);
            const mapArea = (boundsLat1 - boundsLat0) * (boundsLon1 - boundsLon0);
            const ll500 = 500 * 1e-5;
            let doZoom = false;
            const mapWidthMeters = (boundsLon1 - boundsLon0) / 1e-5;
            if (intersectionArea / mapArea < 0.01 && mapWidthMeters > 10000) {
                console.log(`Data zoomed area too small! Intersection area ${intersectionArea}, map area ${mapArea}, map width ${mapWidthMeters.toFixed(0)} m`);
                doZoom = true;
            } else {
                const dLat = (bounds.getNorth() - bounds.getSouth()) * 0.1;
                const dLon = (bounds.getEast() - bounds.getWest()) * 0.1;
                if (minLat < boundsLat0 + dLat || maxLat > boundsLat1 - dLat || minLon < boundsLon0 + dLon || maxLon > boundsLon1 - dLon) {

                    console.log("Data points outside 10% internal buffer of map");
                    doZoom = true;
                }
            }
            if (doZoom) {
                // Add buffer of either % of data width or 500m, whichever is larger
                const flyToPadding = settings.flyToPadding.value / 100;
                let dLat = (maxLat - minLat) * flyToPadding;
                let dLon = (maxLon - minLon) * flyToPadding;
                dLat = Math.max(dLat, ll500);
                dLon = Math.max(dLon, ll500);
                this.map.fitBounds([[minLon - dLon, minLat - dLat], [maxLon + dLon, maxLat + dLat]], { duration: settings.flyToDuration.value });
            }
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
        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, options.dataViews[0]);
        var settings = this.formattingSettings;

        // indicates this is the first segment of new data.
        const dataView = options.dataViews[0];
        let isFinishedLoaded = false;
        if (options.operationKind == VisualDataChangeOperationKind.Create) {
            console.log("New data arrived");
            if (!dataView.metadata.segment) {
                console.log("Data load finished - the first segment is the only one.");
                isFinishedLoaded = true;
            };
        } else if (options.operationKind == VisualDataChangeOperationKind.Append) {
            if (!dataView.metadata.segment) {
                console.log("Data load finished - this is the last segment.");
                isFinishedLoaded = true;
            }
        } else {
            console.log('Unknown operation kind', options.operationKind);
        }

        if (!isFinishedLoaded) {
            this.host.fetchMoreData(true);
            return;
        }

        console.log("Data load finished - processing data");

        // OK, process the data now we've got all of it.
        // TODO: if we want, we could draw it iteratively, but this will increase total execution time.
        this.dataPoints = createSelectorDataPoints(options, settings, this.host, this.decodeCache);

        const dataFilterApplied = options.dataViews[0].metadata.isDataFilterApplied;
        // 2025/20/06 - Disabled auto-clear of selection when a data filter is applied, because then it behaves unexpectedly
        // i.e. if you have a data filter applies (at page level) then none of your selections work. Note sure why I originally
        // had this ... maybe there was a reason, so leave it commented out for now.
        // if (dataFilterApplied && this.selectedIds.length > 0) {
        //     console.log("Clearing selection because data filter is applied");
        //     this.selectedIds = [];
        //     this.selectionManager.clear();
        // }

        if (settings.map.flyTo.value) {
            this.handleFlyTo(settings.map, dataFilterApplied);
        }
        const scatterData = this.dataPoints.filter(x => x.type === InputGeometryType.Scatter);
        this.deckOverlay.setProps({
            layers: [
                getScatterLayer(true, scatterData, settings.scatter, this.selectedIds, this.onClick),
                getScatterLayer(false, scatterData, settings.scatter, this.selectedIds, this.onClick),
                getLineLayer(true, this.dataPoints, settings.line, this.selectedIds, this.onClick),
                getLineLayer(false, this.dataPoints, settings.line, this.selectedIds, this.onClick),
                getArcLayer(true, this.dataPoints, settings.arc, this.selectedIds, this.onClick),
                getArcLayer(false, this.dataPoints, settings.arc, this.selectedIds, this.onClick),
                getPathLayer(true, this.dataPoints, settings.path, this.selectedIds, this.onClick),
                getPathLayer(false, this.dataPoints, settings.path, this.selectedIds, this.onClick),
                getPolygonLayer(true, this.dataPoints, settings.polygon, this.selectedIds, this.onClick),
                getPolygonLayer(false, this.dataPoints, settings.polygon, this.selectedIds, this.onClick),
            ]
        });

    }
    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}

