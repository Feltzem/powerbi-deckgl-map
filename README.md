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
- To support e.g. custom colors/widths per line/row, we allow the user to provide their own #RGBA (for color and opacity) or float (for width). In Javascript we could let the user just provide a custom function (as deck.gl does), but that's trickier in Power BI.
- All color fields can also take numeric values. When a numeric field is bound, the relevant format pane section maps the visible range onto a preset gradient scale for that geometry and color channel. You can classify the values using natural breaks, quantile, equal interval, or defined interval binning, and the visual shows a matching legend for the active classes. Note that opacity can not be set based on numeric field - a #RGBA field must be used to style on both color and opacity.

### Highlighting/selection

Firstly, you can enable highlighting on hover. Easy, it doesn't change any of the data/selections.

Secondly, you can filter the selected shapes by click. This is two way:

- When you click an item on the map (or multiple by holding down CTRL key), it:
  - Filters any associated visual to these selections.
  - But it _doesn't_ remove the other shapes from the map. Why? Because otherwise you wouldn't be able to click another one (especially for multi-select). So you know what you've clicked, it highlights these in red (or whatever color you choose) - again, especially useful for multi-select.
  - When you click on the map, it resets the selection.
- When you select items in an associated visual, it will filter the map to only show those selected shapes i.e. selection not highlighting. If you already have a selection made at map-level, it will remove these.

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
