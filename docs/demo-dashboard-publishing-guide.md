# Demo Dashboard Publishing Guide

This guide describes how to publish the demo Power BI dashboard for the deck.gl map custom visual.

The downloadable report should use the small Hamilton sample bundle in `samples/hamilton` by default. The full New Zealand exports are useful for local testing and richer analysis, but they are too large for a friendly first-run demo and should remain generated artifacts from the City Transportation notebook.

## Release Assets

Attach these files to each GitHub Release:

- `powerbi_deckgl_map.<version>.pbiviz`: the packaged custom visual built by the release workflow.
- `powerbi-deckgl-map-demo-hamilton.pbix`: the manually refreshed demo dashboard.

Keep the `.pbix` out of git. Power BI report files are binary, can grow quickly, and are better treated as release assets.

## Sample Data

The repo-tracked sample data lives in `samples/hamilton`.

It is generated from:

`C:\Users\TownseD\Documents\City Transportation\data\power_bi\hamilton_tla_demo`

The Hamilton bundle is the public demo dataset because it is small, fast to load, and still demonstrates all supported geometry types:

- polygon: Hamilton place polygons using WKP geometry
- path: Hamilton road paths using WKP geometry
- arc: SA2 travel-to-work origin/destination arcs using point 1 and point 2 coordinates
- point: NZTA traffic monitoring sites using latitude and longitude
- multi-geometry: one table combining road-density area polygons, road centreline paths, and NZTA traffic count points
- line: official AT and Metlink ferry line examples using point 1 and point 2 coordinates

Hamilton road paths, SA2 references, and traffic count points are selected using the Stats NZ Hamilton City territorial authority boundary when the boundary artifact is available. This keeps the road-centreline page representative of the whole TLA rather than only the exported place polygons.

The ferry lines are intentionally not Hamilton-specific. They remain in the bundle so the demo covers the straight `line` geometry type.

## Regenerate The Sample Bundle

1. In the City Transportation repo, run `notebooks/analysis/power_bi/data_for_visual.ipynb`.
2. Use the default output directory:

   `C:\Users\TownseD\Documents\City Transportation\data\power_bi`

3. Set `EXPORT_WKT_DEBUG=true` before running the notebook when preparing a PBIX that includes a WKT/WKP comparison page. Otherwise the normal checked-in sample bundle is WKP-focused.
4. Confirm the notebook writes:

   `C:\Users\TownseD\Documents\City Transportation\data\power_bi\hamilton_tla_demo`

5. Copy the contents of that folder into this repo:

   `C:\Users\TownseD\Documents\powerbi-deckgl-map\samples\hamilton`

6. Keep `manifest.json` with the CSV files. It records row counts, validation status, map bounds, and the field mapping metadata used by the demo.

## Build Or Refresh The PBIX

Create or refresh `powerbi-deckgl-map-demo-hamilton.pbix` in Power BI Desktop using `samples/hamilton` as the data source.

Use these report pages:

- **Overview:** a polished Hamilton dashboard with polygons, roads, traffic sites, commuter arcs, and the ferry line sample visible across separate map visuals.
- **Multi-Geometry Map:** one Hamilton visual and one full-New-Zealand visual using the combined `*_multigeometry_road_density_map.csv` tables. Each visual should show road-density area polygons, road centreline paths, and traffic count points on the same map.
- **Geometry Gallery:** one focused visual per geometry type: point, line, arc, path, and polygon.
- **Colouring:** examples of direct text colour measures returning `#RRGGBBAA`, plus numeric fields mapped through the visual's gradient settings.
- **Encoding:** a WKT/WKP comparison for path and polygon layers, using a bundle generated with `EXPORT_WKT_DEBUG=true`, explaining that WKT is readable and WKP is the compact preferred export for larger demo data.
- **Field Bindings:** concise tables showing which CSV columns belong in each Power BI visual bucket.

Use Hamilton map bounds from `samples/hamilton/manifest.json`:

- south: `-37.838592`
- west: `175.212281`
- north: `-37.716442`
- east: `175.335211`

## Required Demo Coverage

The `.pbix` should demonstrate these capabilities clearly:

- importing CSV tables and setting IDs, `layer_type`, `wkp`, and coordinate fields to the correct Power BI data types
- using `Well Known Polyline` for path and polygon WKP geometry
- using `Well Known Text` on at least one path or polygon comparison visual in a PBIX built from `EXPORT_WKT_DEBUG=true` sample data
- using point coordinate roles for point, line, and arc geometry
- using one combined table with `layer_type` values for polygon, path, and point rows in a single map visual
- binding direct colour text fields or measures to colour buckets
- binding numeric fields to the same colour buckets and configuring gradients in the Format pane
- using alpha-bearing colours such as `#RRGGBBAA` or `rgba(...)` when opacity should come from data

## Suggested DAX Measures

Include at least one compact dynamic colour measure in the report, for example:

```DAX
Selected AADT =
SELECTEDVALUE ( hamilton_nzta_traffic_count_site_point[latest_aadt] )

AADT Point Colour =
VAR Metric = [Selected AADT]
RETURN
    SWITCH (
        TRUE (),
        ISBLANK ( Metric ), "#D9D9D900",
        Metric >= 30000, "#7A0177F2",
        Metric >= 15000, "#C51B8ACC",
        Metric >= 5000, "#F768A166",
        "#FDE0DD66"
    )
```

Bind `AADT Point Colour` to `Scatter fill (Hex)` and keep `geometry_id` in the visual so Power BI evaluates the measure per row.

Also include at least one numeric-gradient example, such as binding `road_density_km_per_km2` to `Polygon fill (Hex)` or `people_count` to `Arc Source color` and `Arc Target color`.

For the multi-geometry map page, bind the combined table as:

| Deck.GL role | CSV field |
| --- | --- |
| `Geometry ID` | `geometry_id` |
| `Layer Type` | `layer_type` |
| `Well Known Polyline` | `wkp` |
| `Point1 Latitude` | `point1_latitude` |
| `Point1 Longitude` | `point1_longitude` |
| `Polygon fill (Hex)` | `road_density_km_per_km2` or `polygon_fill_color_value` |
| `Path color` | `path_color_hex` or `path_color_value` |
| `Path width (m)` | `path_width_m` |
| `Scatter fill (Hex)` | `point_fill_color_hex` or `point_fill_color_value` |
| `Scatter radius (m)` | `point_radius_m` |
| `Tooltip HTML` | `tooltip_html` |

Set `Scatter properties > Layer Identifier` to `point`. The full-New-Zealand combined table is already row-window limited; the Hamilton combined table includes all Hamilton road centre lines.

For road paths in the combined tables, both `path_color_value` and `path_color_hex` are road-surface hex colours. Use `road_surface` itself for the category label or slicer.

## Publish A Release

1. Update `package.json` and `pbiviz.json` to the release version.
2. Build or let GitHub Actions build the `.pbiviz` package.
3. Refresh the Hamilton `.pbix` against `samples/hamilton`.
4. Validate the report in Power BI Desktop:
   - all five geometry types render
   - dynamic hex colour measures respond to filters
   - numeric gradients show the expected legend/classes
   - WKT/WKP examples render where included
   - tooltips display formatted HTML
5. Create the GitHub Release and attach the `.pbiviz` plus `powerbi-deckgl-map-demo-hamilton.pbix`.
6. In the release notes, link back to `samples/hamilton` and this guide.

## Full New Zealand Data

Do not commit the full New Zealand CSV exports to this repo. Users who want the whole dataset should run:

`notebooks/analysis/power_bi/data_for_visual.ipynb`

from the City Transportation repo and import the generated files from `data/power_bi`.
