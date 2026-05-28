# Changelog

## 1.7.0.0 - 2026-05-28

### Added

- Added scatter-derived heatmap rendering with optional `Heatmap weight`, radius, intensity, opacity, threshold, palette, and scatter point visibility settings.
- Added scatter-derived H3 hexagon overlays with configurable H3 resolution, count-based fill gradients, count-based transparency, dark grey outlines, joined-point count tooltips, and rounded count legends.
- Added a scatter `Symbol type` dropdown with circle, square, diamond, triangle, inverted triangle, hexagon, pentagon, star, cross, and X cross options while preserving fill and outline styling.

### Changed

- Updated release metadata to version `1.7.0.0`.

## 1.6.2.1 - 2026-05-19

### Added

- Added README links for the nationwide data-generation notebook and the demo screenshot.

### Changed

- Updated release metadata to version `1.6.2.1`.

### Fixed

- Fixed Node 20 release CI test discovery by replacing glob-dependent npm test execution with explicit test-file discovery.

## 1.6.2.0 - 2026-05-19

### Added

- Added compact geometry-type icons to numeric and categorical legend headings.

### Changed

- Updated release metadata to version `1.6.2.0`.
- Updated README legend guidance to describe geometry-aware legend headings.

### Fixed

- Fixed categorical Path color grouping so rows keep their category when Power BI returns sparse grouped values.
- Fixed grouped Path color legends so small categories such as `metalled` remain visible in the unfiltered view.
- Requested Path color as a row category when present so arbitrary text fields keep their per-row colour values.

## 1.6.1.5 - 2026-05-19

### Added

- Added publish checks for linting, TypeScript, focused Node tests, and version synchronization.
- Added focused tests for colour parsing, grouped role columns, coordinate parsing, layer order, tooltip aggregation, and release version checks.

### Changed

- Updated CI to install with `npm ci`, run the full check suite, and then package the visual.
- Made WKP WASM source generation idempotent to avoid unnecessary tracked-file churn.
- Cleaned README release guidance and moved future ideas out of the public TODO section.

### Fixed

- Rejected non-finite point and line/arc coordinates during parsing.
- Removed routine WKP startup logging and noisy MapLibre error logging from production visual code.
- Preserved grouped numeric colour values before classification so grouped polygon legends use the merged maximum.

## 1.6.1.0 - 2026-05-13

### Added

- Added compact geometry-type icons to each tooltip section for scatter, line, arc, path, and polygon features.
- Added a `Legend` Format pane card for numeric gradient legends, including show/hide, panel opacity, classification label visibility, color scale visibility, and heading/value font controls.

### Changed

- Updated release metadata to version `1.6.1.0`.
- Documented tooltip geometry icons, legend settings, and included `package-lock.json` in the release version checklist.

## 1.6.0.0 - 2026-05-12

### Added

- Added an optional on-map layer order control under `Layer controls` > `Show layer order control`; it is off by default and persists layer draw order with the report.
- Added multi-layer tooltip ordering and picking support so tooltip results follow the current visual layer stacking.
- Added automatic 45 degree camera pitch when extruded polygons or valid arcs are currently rendered.

### Changed

- Kept layer ordering on the map instead of requiring users to edit a comma-separated draw-order textbox.
- Made the layer order control compact and anchored it in the bottom-right of the map.
- Removed `(Hex)` from scatter and polygon fill bucket labels because the buckets also accept numeric gradient values and CSS colour strings.
- Updated README guidance for on-map layer ordering, numeric colour buckets, and the Hamilton demo dashboard assets.

### Fixed

- Reset view and fly-to now respect the active 3D pitch state.
- Gradient legends now keep their natural height and only become scrollable when the legend stack is too tall for the visual.
- Legacy or invalid stored layer draw-order values continue to be sanitized before rendering.
