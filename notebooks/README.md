# Power BI Deck.GL Demo Guide

This folder contains the source workflow for exporting public demo CSVs for the Deck.GL Power BI map visual.

- [data_for_visual.ipynb](data_for_visual.ipynb) is the runnable notebook. Use it to build the visual-ready full New Zealand CSVs, the smaller Hamilton public demo bundle, validation summaries, and manifests.
- [public_demo_geometry.py](public_demo_geometry.py) is helper code used by the notebook. It contains reusable source download, geometry preparation, tooltip, Hamilton filtering, field-mapping, validation, and manifest helpers. It is not a separate dashboard export workflow.

The Hamilton bundle is the recommended public download/demo dataset. The full New Zealand CSVs are larger generated outputs for users who want to run the notebook locally.

Use this guide to take the generated CSVs from `data/power_bi` and display them in Power BI Desktop with the packaged custom visual from this repository.

## Prerequisites

Run the notebook in a Python environment with Jupyter and the geospatial/data packages it imports:

- `jupyter`
- `pandas`
- `geopandas`
- `requests`
- `branca`
- `wkp`
- `pyarrow` or another parquet backend supported by pandas/geopandas

The packaged visual is expected under `dist/`, for example:

`dist/powerbi_deckgl_map.1.5.6.0.pbiviz`

## Generate The CSVs

Run [data_for_visual.ipynb](data_for_visual.ipynb). By default it reads prepared artifacts from and writes generated CSVs to:

`data/power_bi`

Useful environment flags:

- `REFRESH_FROM_SOURCE=true`: rebuild LINZ and Stats NZ artifacts. Requires `LINZ_API_KEY` or `LDS_API_KEY`, plus `DATAFINDER_API_KEY`.
- `REFRESH_PUBLIC_DEMO_SOURCES=true`: refresh public demo sources for NZTA traffic count sites, the Stats NZ Hamilton TLA boundary, Hamilton SA2 polygons with more than 90% of their area inside the TLA, Auckland Transport GTFS, Metlink GTFS, NZTA CAS crashes, Stats NZ TA boundaries, building consents, and GeoNet earthquakes. Requires `DATAFINDER_API_KEY` for the TA boundaries used by the building-consents towers. `STATSNZ_API_KEY` is optional and only used as a fallback if the open building-consents CSV is unavailable.
- `REFRESH_PUBLIC_DEMO_SOURCES=false`: reuse prepared public artifacts offline.
- `BUILD_PREVIEW_MAP=true`: write HTML preview maps, including `hamilton_tla_demo/hamilton_road_path_preview.html` so you can visually check the downloaded Hamilton road centre lines.
- `EXPORT_WKT_DEBUG=true`: also export WKT debug columns. WKP is the normal geometry field for path and polygon layers.

Expected visual-ready CSVs:

- `nz_place_polygon.csv`
- `nz_road_path.csv`
- `nz_sa2_travel_to_work_od_2023_arc.csv`
- `nzta_traffic_count_site_point.csv`
- `nz_ferry_route_line.csv`
- `nz_multigeometry_road_density_map.csv`

The notebook also writes a small shareable Hamilton TLA demo bundle:

`data/power_bi/hamilton_tla_demo`

That folder is designed for GitHub/sample hosting because the CSVs are small but still cover all five geometry types. The visual repo keeps a copy at:

`samples/hamilton`

Hamilton visual-ready CSVs:

- `hamilton_place_polygon.csv`
- `hamilton_road_path.csv`
- `hamilton_sa2_travel_to_work_od_2023_arc.csv`
- `hamilton_nzta_traffic_count_site_point.csv`
- `hamilton_ferry_route_line.csv`
- `hamilton_multigeometry_road_density_map.csv`

The Hamilton polygon/path/arc/point layers are filtered from the same full-NZ source tables. Hamilton road paths use the Stats NZ Hamilton City territorial authority boundary with a 250 m context buffer so boundary-hugging sections such as the Waikato Expressway remain visible; traffic sites use the unbuffered boundary. When `statsnz_hamilton_territorial_authority_2023_generalised.geojson` is unavailable, the notebook falls back to the union of exported Hamilton place polygons. `hamilton_place_polygon.csv` uses Stats NZ SA2 polygons from `statsnz_hamilton_sa2_2023_generalised.geojson` only when more than 90% of each SA2 polygon area is inside the Hamilton TLA, with road-density metrics recomputed against those SA2 zones. SA2 references use the same 90% area coverage rule, then fall back to any exported SA2 WKP geometry, and finally to centre-point coverage for older artifacts. The ferry line layer intentionally remains the official AT and Metlink A-to-B line sample so the small bundle still demonstrates the `line` geometry type.

Supporting model CSVs:

- `nz_place_surface_density_fact.csv`
- `nz_place_road_bridge.csv`
- `nz_road_surface_dimension.csv`
- `nz_sa2_reference.csv`
- `manifest.json`

## Install The Visual

In Power BI Desktop:

1. Open a report.
2. In `Visualizations`, select `...`.
3. Choose `Import a visual from a file`.
4. Select the packaged visual from `dist/`, for example `dist/powerbi_deckgl_map.1.5.6.0.pbiviz`.
5. Add the imported Deck.GL visual to the report canvas.

If the `.pbiviz` package is missing or stale, build it from the visual repo:

```powershell
Set-Location '<path-to-this-repo>'
npm run package
```

## Import The CSVs

In Power BI Desktop:

1. Use `Get data > Text/CSV`.
2. Import the files from `data/power_bi`.
3. Load the five visual-ready CSVs first.
4. Load the model tables if you want slicers, relationships, and place-road summaries.
5. In `Transform data`, check the important types:
   - IDs and `wkp`: `Text`
   - `layer_type`: `Text`
   - latitude/longitude fields: `Decimal number`
   - width, radius, count, rank, and metric fields: `Whole number` or `Decimal number`
   - validity fields such as `arc_is_valid` and `line_is_valid`: `True/False`

For the first pass, make one Deck.GL visual per CSV. This is simpler than combining layers, and it makes it obvious which binding belongs to which geometry type.

For a lightweight public demo, import from `data\power_bi\hamilton_tla_demo` instead of the full `data\power_bi` folder. Use the same field bindings below; only the table/file names change from `nz_*` to `hamilton_*`.

## Model Relationships

Create these relationships if you import the model tables:

- `nz_place_polygon[place_feature_id]` 1:* `nz_place_surface_density_fact[place_feature_id]`
- `nz_road_surface_dimension[road_surface]` 1:* `nz_place_surface_density_fact[road_surface]`
- `nz_place_polygon[place_feature_id]` 1:* `nz_place_road_bridge[place_feature_id]`
- `nz_road_path[road_feature_id]` 1:* `nz_place_road_bridge[road_feature_id]`
- `SA2 Origin[origin_sa2_code]` 1:* `nz_sa2_travel_to_work_od_2023_arc[origin_sa2_code]`
- `SA2 Destination[destination_sa2_code]` 1:* `nz_sa2_travel_to_work_od_2023_arc[destination_sa2_code]`

Duplicate `nz_sa2_reference` into separate origin and destination role-playing dimensions if you want independent origin and destination slicers.

Do not create a direct relationship between `nz_place_polygon` and `nz_road_path`. Roads can cross more than one place, so `nz_place_road_bridge` is the stable join.

## Visual Setup Basics

Every Deck.GL visual needs:

- `Geometry ID`: a unique row identifier.
- `Layer Type`: the geometry type string.
- Either `Well Known Polyline` for path/polygon geometry, or point coordinate fields for point/line/arc geometry.
- Optional style fields such as width, radius, fill color, line color, and elevation.
- `Tooltip HTML`: bind `tooltip_html` when you want formatted hover text. The notebook generates logical tooltips for every visual table.

Set these map bounds in `Format visual > Map properties` for a full New Zealand view:

- `Initial southern map latitude`: `-47.5`
- `Initial western map longitude`: `166`
- `Initial northern map latitude`: `-34`
- `Initial eastern map longitude`: `179`

The visual supports one data input per visual. To show multiple geometry types in one map later, append the tables in Power Query and keep the shared role columns aligned. For learning and testing, separate visuals are much easier.

The notebook also exports a ready-made multi-layer map table for this pattern:

- `nz_multigeometry_road_density_map.csv`
- `hamilton_tla_demo/hamilton_multigeometry_road_density_map.csv`

These combine road-density area polygons, road centreline paths, and NZTA traffic count points into one table. The current road-density polygon source is `*_place_polygon.csv` because that is the generated polygon layer with road-density metrics; if an SA2 polygon road-density export is added later, use the same binding pattern.

## Multi-Geometry Road Density Map

Use `nz_multigeometry_road_density_map.csv` for the full New Zealand page, and `hamilton_multigeometry_road_density_map.csv` for the Hamilton page.

Bind fields:

| Deck.GL role | CSV field |
| --- | --- |
| `Geometry ID` | `geometry_id` |
| `Layer Type` | `layer_type` |
| `Well Known Polyline` | `wkp` |
| `Point1 Latitude` | `point1_latitude` |
| `Point1 Longitude` | `point1_longitude` |
| `Polygon fill (Hex)` | `road_density_km_per_km2` or `polygon_fill_color_value` |
| `Polygon line color` | `polygon_line_color_hex` |
| `Polygon line width (m)` | `polygon_line_width_m` |
| `Path width (m)` | `path_width_m` |
| `Path color` | `path_color_hex`, or a numeric field such as `road_length_total_km` for gradients |
| `Scatter radius (m)` | `point_radius_m` |
| `Scatter fill (Hex)` | `point_fill_color_hex` or `point_fill_color_value` |
| `Scatter line color` | `point_line_color_hex` or `point_line_color_value` |
| `Scatter line width (m)` | `point_line_width_m` |
| `Tooltip HTML` | `tooltip_html` |

Format pane:

- `Polygon properties > Layer Identifier`: leave as `polygon`.
- `Path properties > Layer Identifier`: leave as `path`.
- `Scatter properties > Layer Identifier`: set to `point`.
- Configure the polygon fill gradient from `road_density_km_per_km2`.
- For road paths in this combined table, use `path_color_hex` for direct road-surface styling. Use a numeric field such as `road_length_total_km` when you want the visual to build a gradient.
- Use `multi_layer` as a slicer or legend-style table if you want to make the included layers explicit.

The full New Zealand combined table is pre-limited to the visual row window: it keeps all road-density polygons and traffic count points, then adds the longest road centre lines that fit. The Hamilton table includes all Hamilton road centre lines.

## Polygon Visual

Use `nz_place_polygon.csv`.

Bind fields:

| Deck.GL role | CSV field |
| --- | --- |
| `Geometry ID` | `geometry_id` |
| `Layer Type` | `layer_type` |
| `Well Known Polyline` | `wkp` |
| `Polygon fill (Hex)` | `polygon_fill_color_value` or `road_density_km_per_km2` |
| `Polygon line color` | `polygon_line_color_hex` |
| `Polygon line width (m)` | `polygon_line_width_m` |
| `Polygon extrude elevation (meters)` | `polygon_extrude_elevation_m` |
| `Tooltip HTML` | `tooltip_html` |

Format pane:

- `Polygon properties > Layer Identifier`: leave as `polygon`.
- Enable `Filled`.
- Enable `Stroked`.
- Enable `Extruded` if you bind `polygon_extrude_elevation_m`.
- Configure the fill gradient in `Polygon properties` when using `polygon_fill_color_value` or `road_density_km_per_km2`.

This layer is under the visual's 10,000-row window.

## Path Visual

Use `nz_road_path.csv`.

Bind fields:

| Deck.GL role | CSV field |
| --- | --- |
| `Geometry ID` | `geometry_id` |
| `Layer Type` | `layer_type` |
| `Well Known Polyline` | `wkp` |
| `Path width (m)` | `path_width_m` |
| `Path color` | `path_color_hex`, or a numeric field such as `road_length_total_km` for gradients |
| `Tooltip HTML` | `tooltip_html` |

Format pane:

- `Path properties > Layer Identifier`: leave as `path`.
- Use `path_color_hex` for direct road-surface styling. Use `road_length_total_km` or another numeric road field when you want the visual to build a gradient.

Visual-level filter:

- `road_length_rank <= 10000`

The full road path table is larger than the usual Power BI visual row window, so apply the rank filter or use slicers before binding all roads.

## Arc Visual

Use `nz_sa2_travel_to_work_od_2023_arc.csv`.

Bind fields:

| Deck.GL role | CSV field |
| --- | --- |
| `Geometry ID` | `geometry_id` |
| `Layer Type` | `layer_type` |
| `Point1 Latitude` | `point1_latitude` |
| `Point1 Longitude` | `point1_longitude` |
| `Point2 Latitude` | `point2_latitude` |
| `Point2 Longitude` | `point2_longitude` |
| `Arc line width (m)` | `arc_line_width_m` |
| `Arc Source color` | `arc_source_color_rgba` or `arc_source_color_value` |
| `Arc Target color` | `arc_target_color_rgba` or `arc_target_color_value` |
| `Tooltip HTML` | `tooltip_html` |

Format pane:

- `Arc properties > Layer Identifier`: leave as `arc`.
- If using numeric color fields, configure the source and target gradients in `Arc properties`.
- If using RGBA fields, the alpha channel controls opacity.

Visual-level filters:

- `arc_is_valid = TRUE`
- `people_count_rank <= 10000`

## Point Visual

Use `nzta_traffic_count_site_point.csv`.

The CSV uses `layer_type = point` because this is the point geometry example. The custom visual calls the Deck.GL point layer `Scatter`, so one format setting is required.

Bind fields:

| Deck.GL role | CSV field |
| --- | --- |
| `Geometry ID` | `geometry_id` |
| `Layer Type` | `layer_type` |
| `Point1 Latitude` | `latitude` |
| `Point1 Longitude` | `longitude` |
| `Scatter radius (m)` | `point_radius_m` |
| `Scatter fill (Hex)` | `point_fill_color_hex` |
| `Scatter line color` | `point_line_color_hex` |
| `Scatter line width (m)` | `point_line_width_m` |
| `Tooltip HTML` | `tooltip_html` |

Format pane:

- `Scatter properties > Layer Identifier`: set to `point`.
- Enable `Filled`.
- Enable `Stroked`.
- The exported fill and stroke colors are precomputed on a Magma scale from `latest_aadt`.
- If you want the visual to manage the gradient instead, bind `point_fill_color_value` and `point_line_color_value` and configure the matching gradients in `Scatter properties`.

The NZTA file is a traffic site summary only. It does not include the large daily TMS counts table.

## Line Visual

Use `nz_ferry_route_line.csv`.

These are straight A-to-B demo lines from the first and last ordered GTFS shape point, not full curved ferry paths.

Bind fields:

| Deck.GL role | CSV field |
| --- | --- |
| `Geometry ID` | `geometry_id` |
| `Layer Type` | `layer_type` |
| `Point1 Latitude` | `point1_latitude` |
| `Point1 Longitude` | `point1_longitude` |
| `Point2 Latitude` | `point2_latitude` |
| `Point2 Longitude` | `point2_longitude` |
| `(Line) line width (m)` | `line_width_m` |
| `(Line) line color` | `line_color_hex` or `line_color_value` |
| `Tooltip HTML` | `tooltip_html` |

Format pane:

- `Line properties > Layer Identifier`: leave as `line`.
- `line_color_hex` is precomputed from `route_length_km`, from light red for shorter lines to dark red for longer lines.
- If using `line_color_value`, configure the numeric gradient in `Line properties` with a light-red minimum and dark-red maximum.

Visual-level filter:

- `line_is_valid = TRUE`

Official GTFS coverage here means Auckland Transport and Metlink ferry services. It is not a complete catalogue of private or all-NZ ferry routes.

## Common Display Problems

If nothing appears:

- Check `Geometry ID` is bound.
- Check `Layer Type` is bound.
- Check the layer identifier in the Format pane matches the CSV values. The point table needs `Scatter properties > Layer Identifier = point`.
- For path and polygon layers, check `wkp` is bound to `Well Known Polyline`.
- For point, line, and arc layers, check latitude and longitude fields are bound to the point roles.
- Check visual-level filters are not excluding every row.
- Check coordinate fields are numeric, not text.

If points appear but are too large or too small:

- Adjust `Scatter properties > Point radius min/max`.
- Bind `point_radius_m`, or remove it and use the default radius.

If roads or arcs are missing rows:

- Power BI visuals commonly cap the amount of data sent to the visual.
- Keep `road_length_rank <= 10000` for paths.
- Keep `arc_is_valid = TRUE` and `people_count_rank <= 10000` for arcs.

If colors do not look right:

- Bind the `*_hex` or `*_rgba` fields for exact colors and opacity.
- Bind the numeric `*_value` fields only when you want the visual's gradient and legend.
- Configure the matching gradient card in the Format pane for numeric color fields.

## What Python Does Vs Power BI

Keep these steps in Python or prepared artifacts:

- Source downloads and API access
- CRS conversion
- geometry simplification
- line and polygon intersections
- road length by place
- SA2 centrepoint generation
- NZTA traffic site point coordinate derivation
- GTFS ferry filtering and endpoint derivation
- WKP/WKT export

Keep these steps in Power BI:

- CSV import typing
- visual field binding
- visual-level row filters
- slicers and model relationships
- numeric gradient styling
- filter-aware measures and summaries
