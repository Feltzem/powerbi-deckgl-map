# Changelog

## 1.8.0.0 - 2026-06-16

### Added

- Added **3D stacked polygon prisms** via 3D Z height for path and polygon geometry. Paths and polygons supplied as 3D WKT (`LINESTRING Z`, `POLYGON Z`) or 3D WKP carry a per-vertex Z: paths float at their baked elevation, and 3D polygons render as floating prisms whose **base** is the ring Z and whose **height** is the `Polygon extrude elevation` field. Mapping a feature's start datetime to the base and its duration to the height makes features at the same footprint stack into a column (e.g. parking-restriction validity windows along a road). The stacking is static — baked into the data, not driven by the animation playhead. 2D geometry is unchanged.
- Added **Scatter elevation (m)** so scatter/LPR points can bind a direct Z height in metres, including alignment with stacked temporal restriction prisms. When both scatter elevation and `Timestamp` are bound, explicit elevation controls point height and timestamp still controls animation/window visibility.
- Added a **Timestamp** data role (datetime or numeric seconds), an **Animation properties** card, and an on-map **time slider** for in-visual time playback. Turn on `Play` (or use the slider's play/scrub/speed controls) to advance a trailing window `[time - Trail length, time]`: points and paths whose timestamp falls outside the window are hidden. `Animation speed` (simulated seconds per real second) and `Loop` control playback. Scatter points can also rise into a vertical time-rug by their timestamp (up to `Max height`), but only on a tilted camera (see Changed). Geometry that already carries a baked Z keeps that elevation; untimed rows stay at ground level and remain visible. Playback runs entirely inside the visual and does not re-query Power BI per frame.
- Added an **animation-time tooltip**: while the animation is playing, hovering a feature shows the current playhead time. Plausible datetime values render as a localized date/time; arbitrary numeric timestamps render as the raw value.
- Updated release metadata to version `1.8.0.0`.

### Changed

- Made the map **2D top-down by default**. The camera now auto-tilts to 45° only when there is real height to show: a field bound to `Polygon extrude elevation`, arcs drawn, or polygons carrying a baked ring Z. The bare `Polygon properties` > `Extruded` toggle and `Map properties` > `Show 3D buildings` no longer tilt the camera on their own — they still render their height, but only read on a tilted camera, so tilt manually (or bind an elevation field) to view them in 3D. Manual tilts are preserved.
- Gated the scatter **time-rug** (time-as-height) on the camera being tilted. On the default top-down view, animated points stay flat so a 2D time animation reads cleanly; tilt the map to bring the `Max height` time-rug in.

## 1.7.3.0 - 2026-06-11

### Added

- Added a **Manual interval colours** text field alongside the existing manual interval breaks field. Enter comma-separated hex colours (e.g. `#ff0000, #ffaa00, #00cc00`) to assign a specific colour to each manual interval class. If fewer colours than classes are provided the last colour repeats; if the field is left blank the gradient scale is used as normal. Colours are applied to both the map layer and the legend.
- Updated release metadata to version `1.7.3.0`.

## 1.7.2.0 - 2026-06-11

### Added

- Added a **Manual interval** classification method for all numeric colour gradients (scatter fill/line, polygon fill/line, line, path, arc source/target, H3 hexagon). The user enters comma-separated break values (e.g. `0, 10, 50, 100, 500`) and the visual creates one colour class per gap. Values outside the defined range fall into the first or last class.
- Updated release metadata to version `1.7.2.0`.

## 1.7.1.0 - 2026-06-02

### Added

- Added tests for basemap option ordering, legacy alias resolution, and style generation.
- Added a MapLibre 3D buildings overlay with configurable full-height zoom threshold.

### Changed

- Simplified the Basemap dropdown to seven clear report-author choices while keeping legacy basemap IDs compatible through aliases.
- Updated basemap handling to use resilient CARTO-backed styles for the curated map options.
- Updated release metadata to version `1.7.1.0`.

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
