# Changelog

## 1.6.0.0 - 2026-05-12

### Added

- Added an optional on-map layer order control under `Layer controls` > `Show layer order control`; it is off by default and persists layer draw order with the report.
- Added multi-layer tooltip ordering and picking support so tooltip results follow the current visual layer stacking.
- Added automatic 45 degree camera pitch when extruded polygons are enabled, present, and visible.

### Changed

- Kept layer ordering on the map instead of requiring users to edit a comma-separated draw-order textbox.
- Made the layer order control compact and anchored it in the bottom-right of the map.
- Removed `(Hex)` from scatter and polygon fill bucket labels because the buckets also accept numeric gradient values and CSS colour strings.
- Updated README guidance for on-map layer ordering, numeric colour buckets, and the Hamilton demo dashboard assets.

### Fixed

- Reset view and fly-to now respect the active polygon extrusion pitch state.
- Gradient legends now keep their natural height and only become scrollable when the legend stack is too tall for the visual.
- Legacy or invalid stored layer draw-order values continue to be sanitized before rendering.
