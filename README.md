# Mapviz

Designed to support points / lines / polygons from <https://deck.gl/docs/api-reference/layers/geojson-layer> (i.e. not text/icons yet).

## TODO

- add wkt

- Add satellite layer?
- Add icon to reset the map tilt/bearing.
- highlight this way: <https://learn.microsoft.com/en-us/power-bi/developer/visuals/highlight?tabs=Standard>

- extra layers:
  - <https://deck.gl/docs/api-reference/layers/column-layer>
  - swithc polygon layer to <https://deck.gl/docs/api-reference/layers/solid-polygon-layer>
  - aggregate:
    - <https://deck.gl/docs/api-reference/aggregation-layers/heatmap-layer>
    - <https://deck.gl/docs/api-reference/aggregation-layers/hexagon-layer>

## Developing

- Make sure you're using Powershell 7.
- `pbiviz install-cert` - make sure you install it, may need to run multiple times.
- `pbiviz start`
- in your browser, go to `https://localhost:8080/assets/` - if complains about certs, you may need to install. Or click "go ahead" which will let you dev.
- go to `app.powerbi.com`, enable developer mode, and add a custom visual.

## Building

- `pbiviz package`
