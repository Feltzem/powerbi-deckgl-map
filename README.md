# Power BI deck.gl map custom visual

Designed to support points / lines / polygons from <https://deck.gl/docs/api-reference/layers/geojson-layer> (i.e. not text/icons yet).

## Install

- Download the latest `*.pbiviz` from <https://github.com/Feltzem/powerbi-deckgl-map/releases>
- [Install a custom visual in Power BI](https://learn.microsoft.com/en-us/power-bi/developer/visuals/import-visual#import-a-visual-file-from-your-local-computer-into-power-bi).

## Usage

For now, the main things to know:

- Terminology and variables closely match those from [deck.gl](https://deck.gl/)
- We support the following layers:
  - Scatter - for scatters/points. See [ScatterplotLayer](https://deck.gl/docs/api-reference/layers/scatterplot-layer).
  - Line - for a straight line from one point to another. See [LineLayer](https://deck.gl/docs/api-reference/layers/line-layer).
  - Arc - for an arc from one point to another. See [ArcLayer](https://deck.gl/docs/api-reference/layers/arc-layer).
  - Path - for a sequence of points making a 2D path/linestring. See [PathLayer](https://deck.gl/docs/api-reference/layers/path-layer). Note, this supports `MultiLineString`s, and hence uses `GeoJsonLayer` under the hood (as it takes care of splitting into individual `LineString`s but keeping highlighting/picking still being tied to the main row.)
  - Polygon - for a sequence of points making a polygon. See [PolygonLayer](https://deck.gl/docs/api-reference/layers/polygon-layer). Note, this supports `MultiPolygon`s as well - see above.
- We can only (?) have a single input to a visual, which means if we want multiple layer types on each visual, they all need to be in the same table. Therefore:
  - We specify a layer type column which contains either `'scatter'`, `'arc'`, `'line'`, `'path'`, or `'polygon'` to specify which type to draw. (These strings can be customised in the options.)
  - Individual columns/values/defaults for each of the different attributes. E.g. you can have a column for the scatter fill color or polygon fill color (which can be the same).
- To support e.g. custom colors/widths per line/row, we allow the user to provide their own `#RGB`, `#RRGGBB`, `#RRGGBBAA`, `rgb(...)`, or `rgba(...)` string (for color and opacity) or float (for width). In Javascript we could let the user just provide a custom function (as deck.gl does), but that's trickier in Power BI.
- All color fields can also take numeric values. When a numeric field is bound, the relevant format pane section maps the visible range onto a preset gradient scale for that geometry and color channel. You can classify the values using natural breaks, quantile, equal interval, or defined interval binning, and the visual shows a matching legend for the active classes. Note that opacity can not be set based on numeric field - an explicit alpha-bearing color such as `#RRGGBBAA` or `rgba(...)` must be used to style both color and opacity.

### Arc styling notes

- `Arc Source color` and `Arc Target color` accept direct CSS/hex colors and preserve any alpha channel present in the bound data.
- Arc opacity always comes from the alpha channel in the bound source/target color field, or from the format pane defaults when no color bucket value is supplied.

### Highlighting/selection

Firstly, you can enable highlighting on hover. Easy, it doesn't change any of the data/selections.

Secondly, you can filter the selected shapes by click. This is two way:

- When you click an item on the map (or multiple by holding down CTRL key), it:
  - Filters any associated visual to these selections.
  - But it _doesn't_ remove the other shapes from the map. Why? Because otherwise you wouldn't be able to click another one (especially for multi-select). So you know what you've clicked, it highlights these in red (or whatever color you choose) - again, especially useful for multi-select.
  - When you click on the map, it resets the selection.
- When you select items in an associated visual, it will filter the map to only show those selected shapes i.e. selection not highlighting. If you already have a selection made at map-level, it will remove these.

## Sample Data

- Diagnostic sample CSV: `data_samples/data.csv`
- Matching Power Query / Advanced Editor script: `data_samples/data.powerquery.m`
- Matching Python transform script: `scripts/build_powerbi_table.py`
- Running `python scripts/build_powerbi_table.py` creates a SQLite table at `data_samples/generated/data.powerbi.sqlite` with the same typed columns plus the derived `tooltip` column.
- The checked-in query points at the repo-local copy of the CSV so it can be imported into Power BI without relying on the original external folder.

## TODO

- Allow Z in polygon and path layer.
- Add example pbix.
- Add screenshots to readme.
- Add satellite layer?
- Add icon to reset the map tilt/bearing.
- highlight this way: <https://learn.microsoft.com/en-us/power-bi/developer/visuals/highlight?tabs=Standard>
- extra layers:
  - <https://deck.gl/docs/api-reference/layers/column-layer>
  - aggregate:
    - <https://deck.gl/docs/api-reference/aggregation-layers/heatmap-layer>
    - <https://deck.gl/docs/api-reference/aggregation-layers/hexagon-layer>
- versioning - ensure package.json, pbiviz.json and the release all have same version.
- vector layers ... why not working? CORS issue it seems, even if allowed through.

## Developing

- Make sure you're using Powershell 7.
- `pbiviz install-cert` - make sure you install it, may need to run multiple times.
- `pbiviz start`
- in your browser, go to `https://localhost:8080/assets/` - if complains about certs, you may need to install. Or click "go ahead" which will let you dev.
- go to `app.powerbi.com`, enable developer mode, and add a custom visual.

If you update the `@wkpjs/web` version, re-run `npm run generate:wkp-wasm` - we embed the wasm since PowerBI prevents loading it.

### Building

- `pbiviz package`

### Releasing

To create a new release:

1. Update the version in `pbiviz.json` and `package.json`.
2. Push a new tag: `git tag v1.x.x && git push origin v1.x.x`.
3. The GitHub Action will automatically build and create a GitHub Release with the `.pbiviz` asset.

# Power BI Colour Measures And Numeric Gradients

Every colour bucket in the visual accepts one of two inputs:

1. A text measure or column that returns a CSS/hex colour such as `#RGB`, `#RRGGBB`, `#RRGGBBAA`, `rgb(...)`, or `rgba(...)`.
2. A numeric measure or column that the visual maps through a gradient configured in the Format pane.

Use a text colour measure when you want exact control over the final colour or opacity from DAX. Use a numeric field when you want the visual to manage the gradient, class breaks, and legend for you.

## General Setup

1. Put `Geometry ID` in the visual so Power BI evaluates the colour measure at row level.
2. Bind the geometry-specific colour bucket to either:
   - a text colour measure that returns a colour string, or
   - a numeric measure that returns the value to classify.
3. If you bind a numeric field, open the matching Format pane card and configure:
   - `Gradient scale`
   - `Classification method`
   - `Class count`
   - `Defined interval`
4. If you bind a text colour measure, include alpha in the returned value if you want DAX to control opacity as well.

For numeric gradients, opacity comes from the default opacity setting in the same Format pane card. For text colours, any alpha you return in `#RRGGBBAA` or `rgba(...)` is preserved.

## Geometry-Specific Colour Buckets

| Geometry type | Use this bucket for a custom colour measure                           | Use this bucket for a numeric gradient             | Format pane card     |
| ------------- | --------------------------------------------------------------------- | -------------------------------------------------- | -------------------- |
| Scatter       | `Scatter fill (Hex)` for point fill, `Scatter line color` for outline | Same buckets; bind a numeric field instead of text | `Scatter properties` |
| Line          | `(Line) line color`                                                   | Same bucket; bind a numeric field instead of text  | `Line properties`    |
| Path          | `Path color`                                                          | Same bucket; bind a numeric field instead of text  | `Path properties`    |
| Polygon       | `Polygon fill (Hex)` for fill, `Polygon line color` for outline       | Same buckets; bind a numeric field instead of text | `Polygon properties` |
| Arc           | `Arc Source color` and `Arc Target color`                             | Same buckets; bind numeric fields instead of text  | `Arc properties`     |

When a geometry exposes both fill and line colours, you can drive them independently. For arcs, source and target colours are also independent, so you can bind one measure to `Arc Source color` and a different measure to `Arc Target color`.

## Format Pane Options For Numeric Fields

If a colour bucket contains numbers instead of colour strings, the visual maps the visible range to the gradient configured in the matching geometry card:

- `Scatter properties`: separate `Fill ...` and `Line ...` gradient settings.
- `Line properties`: one gradient for `(Line) line color`.
- `Path properties`: one gradient for `Path color`.
- `Polygon properties`: separate `Fill ...` and `Line ...` gradient settings.
- `Arc properties`: separate `Source ...` and `Target ...` gradient settings.

The supported classification methods are `Natural breaks`, `Quantile`, `Equal interval`, and `Defined interval`. When a numeric field is active, the visual also renders a matching legend for the active classes.

## Simple Custom Colour Measure Example

This is the simplest pattern when you want DAX to return the actual colour used by the visual:

```DAX
Colour Metric =
SELECTEDVALUE ( YourTable[count] )

Custom Colour Hex =
VAR Metric = [Colour Metric]
RETURN
    SWITCH (
        TRUE (),
        ISBLANK ( Metric ), "#D9D9D900",
        Metric >= 1000, "#005BBBF2",
        Metric >= 250, "#66A3E0CC",
        "#EAF3FF66"
    )
```

Bind `Custom Colour Hex` to the relevant colour bucket for the geometry you are drawing:

- `Scatter fill (Hex)` or `Scatter line color`
- `(Line) line color`
- `Path color`
- `Polygon fill (Hex)` or `Polygon line color`
- `Arc Source color` or `Arc Target color`

## Simple Numeric Measure Example

If you want the visual to manage the colour ramp instead of DAX, return a number and bind that directly to the same bucket:

```DAX
Colour Metric =
SELECTEDVALUE ( YourTable[count] )
```

Then configure the gradient in the Format pane:

- `Scatter properties`: set `Fill Gradient scale` or `Line Gradient scale`.
- `Line properties`: set `Gradient scale`.
- `Path properties`: set `Gradient scale`.
- `Polygon properties`: set `Fill Gradient scale` or `Line Gradient scale`.
- `Arc properties`: set `Source Gradient scale` or `Target Gradient scale`.

This is the easier option when you want a legend and want to tune classification without editing DAX.

## How To Apply This To Each Geometry Type

### Scatter

For points, use `Scatter fill (Hex)` for the point body and `Scatter line color` for the outline. Each can take either a text colour measure or a numeric measure. If you use numeric values, configure the matching `Fill ...` or `Line ...` gradient settings in `Scatter properties`.

### Line

For straight line segments, bind either a text colour measure or a numeric measure to `(Line) line color`. If the value is numeric, set the gradient in `Line properties`.

### Path

For `LineString` and `MultiLineString` paths, bind either a text colour measure or a numeric measure to `Path color`. If the value is numeric, set the gradient in `Path properties`.

### Polygon

For polygons, use `Polygon fill (Hex)` for fill colour and `Polygon line color` for the border. You can mix approaches, for example a direct hex fill measure with a numeric outline measure. If a bucket is numeric, configure the matching `Fill ...` or `Line ...` gradient settings in `Polygon properties`.

### Arc

For arcs, use `Arc Source color` for the start of the arc and `Arc Target color` for the end. You can return explicit colours from DAX for both ends, or bind numeric fields and configure `Source ...` and `Target ...` gradients separately in `Arc properties`.

## Worked Example: Arc Colour Measures

The measures below are a worked example for arcs. They keep the colour scale relative to the current filter context, so a small destination subset still spans a full min_color-to-max_color ramp.

### Setup

1. Put `geometry_id` in the visual so each arc evaluates at row level.
2. Use `arc_is_valid = TRUE` as a visual filter if the visual allows it.
3. Bind the source colour bucket to one of the `Arc Source Hex ...` measures.
4. Bind the target colour bucket to one of the `Arc Target Hex ...` measures.
5. Keep using the exported `count` field as the measure input.

### Base Measures

```DAX
Arc Count =
SELECTEDVALUE ( data[count] )

Arc Is Valid =
COALESCE (
    SELECTEDVALUE ( data[arc_is_valid] ),
    FALSE ()
)

Visible Arc Min Log =
VAR VisibleArcs =
    FILTER (
        ALLSELECTED ( data ),
        data[arc_is_valid] = TRUE ()
            && NOT ISBLANK ( data[count] )
            && data[count] > 0
    )
RETURN
    MINX ( VisibleArcs, LN ( 1 + data[count] ) )

Visible Arc Max Log =
VAR VisibleArcs =
    FILTER (
        ALLSELECTED ( data ),
        data[arc_is_valid] = TRUE ()
            && NOT ISBLANK ( data[count] )
            && data[count] > 0
    )
RETURN
    MAXX ( VisibleArcs, LN ( 1 + data[count] ) )

Arc Colour Ratio =
VAR CurrentCount = [Arc Count]
VAR CurrentLog = LN ( 1 + CurrentCount )
VAR MinLog = [Visible Arc Min Log]
VAR MaxLog = [Visible Arc Max Log]
RETURN
    IF (
        ISBLANK ( CurrentCount ) || CurrentCount <= 0,
        0,
        MAX ( 0, MIN ( 1, DIVIDE ( CurrentLog - MinLog, MaxLog - MinLog, 0 ) ) )
    )

Arc Target Hex Custom =
VAR IsValid = [Arc Is Valid]
VAR Ratio = [Arc Colour Ratio]

VAR StartR = 255
VAR StartG = 255
VAR StartB = 255
VAR StartA = 51

VAR EndR = 0
VAR EndG = 91
VAR EndB = 187
VAR EndA = 242

VAR Red = ROUND ( StartR + ( EndR - StartR ) * Ratio, 0 )
VAR Green = ROUND ( StartG + ( EndG - StartG ) * Ratio, 0 )
VAR Blue = ROUND ( StartB + ( EndB - StartB ) * Ratio, 0 )
VAR Alpha = ROUND ( StartA + ( EndA - StartA ) * Ratio, 0 )

VAR Digits = "0123456789ABCDEF"

VAR RedHex =
    MID ( Digits, INT ( Red / 16 ) + 1, 1 )
        & MID ( Digits, MOD ( Red, 16 ) + 1, 1 )
VAR GreenHex =
    MID ( Digits, INT ( Green / 16 ) + 1, 1 )
        & MID ( Digits, MOD ( Green, 16 ) + 1, 1 )
VAR BlueHex =
    MID ( Digits, INT ( Blue / 16 ) + 1, 1 )
        & MID ( Digits, MOD ( Blue, 16 ) + 1, 1 )
VAR AlphaHex =
    MID ( Digits, INT ( Alpha / 16 ) + 1, 1 )
        & MID ( Digits, MOD ( Alpha, 16 ) + 1, 1 )

RETURN
    IF (
        NOT IsValid,
        "#D9D9D900",
        "#" & RedHex & GreenHex & BlueHex & AlphaHex
    )

Arc Source Hex Custom =
VAR IsValid = [Arc Is Valid]
VAR Ratio = [Arc Colour Ratio]
VAR SourceRatio = Ratio * 0.65

VAR StartR = 255
VAR StartG = 255
VAR StartB = 255
VAR StartA = 51

VAR EndR = 0
VAR EndG = 91
VAR EndB = 187
VAR EndA = 174

VAR Red = ROUND ( StartR + ( EndR - StartR ) * SourceRatio, 0 )
VAR Green = ROUND ( StartG + ( EndG - StartG ) * SourceRatio, 0 )
VAR Blue = ROUND ( StartB + ( EndB - StartB ) * SourceRatio, 0 )
VAR Alpha = ROUND ( StartA + ( EndA - StartA ) * Ratio, 0 )

VAR Digits = "0123456789ABCDEF"

VAR RedHex =
    MID ( Digits, INT ( Red / 16 ) + 1, 1 )
        & MID ( Digits, MOD ( Red, 16 ) + 1, 1 )
VAR GreenHex =
    MID ( Digits, INT ( Green / 16 ) + 1, 1 )
        & MID ( Digits, MOD ( Green, 16 ) + 1, 1 )
VAR BlueHex =
    MID ( Digits, INT ( Blue / 16 ) + 1, 1 )
        & MID ( Digits, MOD ( Blue, 16 ) + 1, 1 )
VAR AlphaHex =
    MID ( Digits, INT ( Alpha / 16 ) + 1, 1 )
        & MID ( Digits, MOD ( Alpha, 16 ) + 1, 1 )

RETURN
    IF (
        NOT IsValid,
        "#D9D9D900",
        "#" & RedHex & GreenHex & BlueHex & AlphaHex
    )
```

The same pattern works for other geometry types as well:

- Scatter: bind the final measure to `Scatter fill (Hex)` or `Scatter line color`.
- Line: bind the final measure to `(Line) line color`.
- Path: bind the final measure to `Path color`.
- Polygon: bind the final measure to `Polygon fill (Hex)` or `Polygon line color`.
- Arc: bind separate measures to `Arc Source color` and `Arc Target color` when you want different colours at each end.
