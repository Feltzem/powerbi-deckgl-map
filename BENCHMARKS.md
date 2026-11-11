# Benchmarks

Performance work on `perf/rust-core`. The baseline is release 1.9.0.2 (`73ea904`) with no changes to `src/`. [Phase 2](#phase-2-typescript-fixes) compares the cheap TypeScript fixes against it with the same harness.

## Summary

- The largest cost from a data change to first draw is the JS row loop in `createDatasetSnapshot`, not geometry decoding. Most of that loop is role-column coalescing plus repeated colour-string parsing.
- `getDataBoundingBox` is the second-largest cost at 100k rows and above. It sorts every longitude in the dataset to find the antimeridian-safe range.
- WKT decoding through `@loaders.gl/wkt` costs 3–7× more than WKP decoding of the same geometry.
- deck.gl tessellation is 13–15% of first-draw time. Polygon fill tessellation dominates it.
- Natural breaks (Jenks) costs a near-flat 120–370 ms per classified role in Chrome, because the input is sampled down to 5,000 values.
- Point animation is already GPU-side and cheap, with no dropped frames at 500k points. Path animation at 100k paths is GPU-bound at 30 fps.
- H3 aggregation reruns on every render (data, format, click, `zoomend`), and the legend runs it a second time.
- Phase 2 fixes cut data change → first draw by up to 2× on Hamilton tables (crash points with H3: 397 → 203 ms) and up to 2.4× at 500k rows (lines: 2,311 → 949 ms). Screenshots are byte-identical and pipeline output is unchanged.

## Method

### Harness

| File | Role |
|---|---|
| `scripts/benchmarks/datasets.ts` | Hamilton CSV loader, data-view builder, mock host, seeded synthetic generators |
| `scripts/benchmarks/stages.ts` | Times each pipeline stage by calling the exported `src/` functions that `Visual.update()` and `buildDeckLayers()` call |
| `scripts/benchmarks/stages-node.ts` | Runs `stages.ts` under Node (`tsx`) |
| `scripts/benchmarks/browser/run.ts` | Bundles the browser pages with esbuild, serves them on 127.0.0.1 and drives headless Chrome over CDP |
| `scripts/benchmarks/browser/stages-page.ts` | Runs `stages.ts` in Chrome, including WKP |
| `scripts/benchmarks/browser/e2e-page.ts` | Loads the packaged `.tmp/drop/visual.js`, creates it with `plugin.create({ element, host })` and times `update()` to first draw |
| `scripts/benchmarks/profile-node.ts` | V8 CPU profile of parse and layer build, self time by function |
| `scripts/benchmarks/report.ts` | Generates the tables in this file |
| `scripts/benchmarks/parity-snapshot.ts` | Digests the pipeline's output per scenario so two checkouts can be compared |

The harness adds no npm dependencies. esbuild comes with `tsx`, the CDP client uses Node's built-in `WebSocket`, and Chrome is the installed copy. Chrome runs with `--host-resolver-rules` mapping every host except 127.0.0.1 to NOTFOUND, and every scenario uses the `blank` basemap, so no tile or network requests are made.

### Commands

```sh
npx pbiviz package                                  # builds .tmp/drop/visual.js for the e2e page
npm run bench:stages -- --label baseline            # Node stage timings, WKT only
npm run bench:browser -- --mode both --label baseline
npm run bench:browser -- --mode e2e --filter 'hamilton|10k|prism|polygon' --screenshots .tmp/benchmarks/screens/baseline
npm run bench:profile -- --scenario line-hex-100k
npm run bench:report -- --label after --compare baseline
npm run bench:parity -- --label after                # then --compare baseline,after
```

Results go to `.tmp/benchmarks/` (git-ignored).

### Stage definitions

| Stage | What runs | Repeats |
|---|---|---|
| Parse | `createDatasetSnapshot` with an empty geometry cache | 1 cold run, then 3–9 runs within a 4 s budget; tables report the median of the repeats |
| WKT / WKP | `parseSync(WKTLoader)` / WKP `decode` on every geometry string | same |
| Colour parse ×1 | `parseColorInput` once per bound colour cell; real parsing repeats it about 4× per cell (see ranking) | same |
| Validate | `validateData` per row | same |
| Bounds | `getDataBoundingBox` over all rows | same |
| Quantile, Jenks | `getNumericColorBins` on the primary numeric colour values, 7 classes | same |
| H3 r7 | `aggregateScatterToH3Cells` at resolution 7 | same |
| Time mask (CPU ref) | `isWithinTrailingWindow` over all timestamps. Reference only; the visual filters on the GPU | same |
| Layer build | Layer factories as in `buildDeckLayers`, incl. classification, H3 and label prep; excludes deck.gl attribute generation | same |
| Colour accessors | Every colour accessor over every object, as deck.gl does when filling colour attributes | same |
| Legend | `getGradientLegendSpecs` sharing the layer build's classification cache | same |

End-to-end timings run the packaged `visual.js`. Each run uses a fresh tab and a fresh visual, takes the median of 3 runs, and covers:

- **update()**: the synchronous `Visual.update` call, with **parse** and **layer build + legend** read from the visual's own `performance.measure` marks.
- **deck first frame CPU**: the deck.gl animation-loop frame that draws the new layers. **layer updates** is the part spent in `LayerManager._initializeLayer` / `_updateLayer` (attribute generation, tessellation, accessor calls).
- **data change → first draw**: from the `update()` call until deck.gl finishes a frame with every layer loaded, plus a 1-pixel `readPixels` so GPU work is included.
- Animation: 5 s of playback, sampling the visual's tick (`pushAnimationFrame` + time slider), deck.gl's per-frame CPU and `requestAnimationFrame` intervals.

### Data view shape

The builder gives `categorical.values` a `grouped()` that returns one group holding the same columns. That is how I understand Power BI's data view when no series field is bound. The visual's `getRoleColumns` then sees two candidates per role and merges them row by row. That merge is the largest single cost below, so the assumption matters. Without `grouped()`, parse falls 1.5–3× (Node, 100k rows):

| Scenario | Parse with `grouped()` | Parse without |
|---|---:|---:|
| hamilton-crash-scatter (31,704) | 121 | 46 |
| scatter-numeric-timed-100k | 314 | 127 |
| line-hex-100k | 654 | 185 |
| polygon-wkt-numeric-100k | 2,519 | 1,510 |
| mixed-wkt-numeric-100k | 1,432 | 593 |

The mock host's selection IDs are minimal stubs. Power BI's real `createSelectionId` does more work per row, so parse timings here are a lower bound.

### Datasets

| Set | Source | Rows |
|---|---|---|
| Hamilton | `samples/hamilton/*.csv`, bound as in `manifest.json` | 11 scenarios, 39 – 31,704 rows; crash points exceed the 10,000-row window and reach the visual through `fetchMoreData` |
| Synthetic | Seeded generator (`mulberry32`, seed 20261022) over NZ bounds: scatter, line, arc, path (2–30 vertices), polygon (6–40-vertex rings, 10% with a hole), 3D stacked prisms (`POLYGON Z`), mixed | 10k, 100k, 500k; path and polygon in WKT and WKP |
| NZ-scale substitute | Hamilton road network repeated 44× with offsets, keeping real shapes and vertex counts | 99,352 WKP paths |

The visual's row window is 10,000 (`capabilities.json`), so 100k and 500k test the `fetchMoreData` range. The NZ export from `notebooks/nz_data_for_visual.ipynb` could not be generated. It needs the prepared LINZ/Stats NZ artifacts (`PBI_DECKGL_ARTIFACT_DIR`) or LINZ and Datafinder API keys, plus geopandas, and none are on this machine.

### Machine

| Item | Value |
|---|---|
| CPU / RAM | Apple M5, 24 GB |
| OS | macOS 26.6.2 (25G83) |
| Node | 26.0.0 |
| Browser | Chrome 155.0.8059.85, headless (new), 1280×800, DPR 1 |
| GPU path | WebGL2 via ANGLE Metal (Apple M5) |
| Libraries | deck.gl 9.2.6, MapLibre GL 5.17.0, h3-js 4.4.0, @loaders.gl/wkt 4.3.4, @wkpjs/web 0.4.0, powerbi-visuals-tools 7.0.2 |

Power BI Desktop renders visuals in WebView2 (Chromium) on Windows. Absolute times will differ there, but the ranking should hold because the same V8 and ANGLE stack runs the same code.

Chrome caches compiled shaders for the browser session. The first scenario in a session pays shader compilation, so end-to-end medians mostly reflect a warm cache. That matches Power BI Desktop after first use, because WebView2 keeps its shader cache on disk.

## Bundle size

| Artifact | Baseline bytes | After Phase 2 (`c03d9e1`) |
|---|---:|---:|
| `dist/powerbi_deckgl_map.1.9.0.2.pbiviz` | 655,966 | 656,010 |
| `.tmp/drop/visual.js` | 2,363,754 | 2,363,491 |
| `.tmp/drop/visual.css` | 88,867 | 88,867 |
| Embedded WKP wasm (`src/wkpWasmBase64.ts`, base64 of 28,142 bytes) | 40,381 | 40,381 |

## Hotspot ranking

The ranking splits each end-to-end first draw into exclusive parts and sums them over three workloads. Parse is split using the Chrome stage medians, scaled to the visual's measured parse time. "Row handling" is the parse time not explained by geometry, bounds, validation or a single colour-parse pass.

| Rank | Part | Hamilton (11 scenarios, 1,670 ms) | Synthetic 100k (7 scenarios, 5,633 ms) | Synthetic 500k (7 scenarios, 29,779 ms) |
|---:|---|---:|---:|---:|
| 1 | Parse: row handling | 602 ms (36%) | 2,153 ms (38%) | 11,030 ms (37%) |
| 2 | Parse: bounds (`getDataBoundingBox`) | 75 ms (4%) | 989 ms (18%) | 6,019 ms (20%) |
| 3 | Parse: geometry decode (WKT/WKP) | 16 ms (1%) | 890 ms (16%) | 4,792 ms (16%) |
| 4 | deck.gl attribute generation / tessellation | 219 ms (13%) | 851 ms (15%) | 3,757 ms (13%) |
| 5 | `update()` outside parse and layer build (settings model, basemap, camera, controls; not yet profiled) | 200 ms (12%) | 228 ms (4%) | 1,261 ms (4%) |
| 6 | Layer build + legend (incl. H3 twice, classification) | 107 ms (6%) | 176 ms (3%) | 1,088 ms (4%) |
| 7 | Wait for frame + GPU completion | 383 ms (23%) | 191 ms (3%) | 906 ms (3%) |
| 8 | Parse: colour parsing, one pass | 39 ms (2%) | 99 ms (2%) | 610 ms (2%) |
| 9 | Parse: validate | 7 ms (0.4%) | 44 ms (1%) | 301 ms (1%) |
| 10 | deck.gl draw submission + shader setup | 23 ms (1%) | 14 ms (0.2%) | 15 ms (0.1%) |

Hamilton's GPU wait is mostly the heatmap: about 295 of the 383 ms. The heatmap takes 510 ms to first draw, against 211 ms for the same points drawn as scatter.

### What the profiles attribute row handling to

From `npm run bench:profile` (Node, self time per 100k rows):

| Function | line-hex-100k | polygon-wkt-numeric-100k | Cause |
|---|---:|---:|---|
| `parseColorString` (`src/col.ts`) | 108 ms | 95 ms | Each colour cell is parsed about 4× (role coalescing, grouped merge, `hasMeaningfulRoleValue`, then the row parser), with regexes each time |
| `getTrimmedTextValue` (`src/powerbiUtils.ts`) | 33 ms | 33 ms | Quote-stripping regex on every colour cell, every pass |
| `getGroupedRoleColumns` + `coalesceRoleColumn` + `mergeGroupedRoleValues` | 98 ms | 72 ms | Row-by-row merge of the duplicate grouped and plain candidates, allocating per row |
| `getMinimalLongitudeRange` (`src/geom.ts`) | 40 ms | 261 ms | `filter` + `map` + `sort` of every vertex longitude |
| `@loaders.gl/wkt` tokeniser (`multicoords`, `$`) | – | 708 ms | Regex tokenising into nested arrays |
| `@loaders.gl/core` `parseSync` overhead | – | ~70 ms | Option merging and URL handling on every call |
| Garbage collection | 44 ms | 246 ms | Per-row objects, nested GeoJSON arrays, intermediate arrays |

### Candidates this ranking points to

| Candidate | Phase | Expected effect | Status |
|---|---|---|---|
| Cache `parseColorInput` by value | 2 | Removes the repeated regex parsing in rank 1 | Done, `49fac4d` |
| Make role coalescing cheaper | 2 | Removes the per-row allocations in rank 1 | Done, `d1a9e7b`. The duplicate candidates are still merged: skipping them changes blank-cell handling, so it needs a semantics decision |
| Replace the longitude sort in `getMinimalLongitudeRange` with a min/max pass plus a fallback for wide data | 2 | Removes most of rank 2; output must stay identical | Done, `a093c4e` |
| Cache H3 cells by scatter data and resolution; reuse them in the legend | 2 | Removes 2 aggregations per render, on every zoom | Done, `fccb591` |
| Call `WKTLoader.parseTextSync` instead of `parseSync` | 2 | Cuts per-row loader overhead | Done, `2a78519` |
| Move the path trailing-window test from fragment `discard` to the vertex shader | 2 | Fixes the GPU-bound path animation | Not done: interpolated and per-vertex timestamps can disagree by one float32 step at the window edge, so boundary paths could flip one frame early or late. Needs a decision on whether that counts as an output change |
| Profile `update()` outside parse and layer build | 2 | Rank 5, 12% at Hamilton scale | Not done |
| WKT parsing to flat coordinates in Rust | 3 | Rank 3 for WKT tables | |
| Bounds and validation over flat coordinate arrays in Rust | 3 | Bounds is now 6–20× cheaper; validation is about 1% | Re-profile first |
| Jenks in Rust | 3 | Near-flat 120–370 ms per classified role | |
| H3 aggregation in Rust (h3o) | 3 | 470 ms at 500k points, now once per data change | |
| Trailing-window time filter in Rust | 3 | Probably not worth it: the filter already runs on the GPU, and the CPU reference costs 3 ms at 500k | |

## Phase 2: TypeScript fixes

Five changes, one commit each, every one checked three ways:

- **Pipeline parity:** `npm run bench:parity` digests parsed rows, colour stats, bounds, time domain, every colour accessor's output, legend specs and H3 cells for 24 scenarios. All 264 sections match 1.9.0.2 after every commit.
- **Pixels:** the 22 baseline screenshots (Hamilton, 10k synthetic, polygons and prisms up to 500k) are byte-identical after Phase 2.
- **Tests:** new parity tests pin the bounds code to a frozen copy of 1.9.0.2 on seeded fuzz data, and the WKT call to `parseSync`'s output. `npm run check` passes with 169 tests.

### Per-change stage gains

Node 26 on the M5. A/B rounds alternate the previous commit (worktree) and the change, and report the best time across rounds; the machine's run-to-run noise was up to 2× on a single median.

| Commit | Change | Stage gain |
|---|---|---|
| `49fac4d` | Cache `parseColorInput` by string | Parse 1.2–2.1× (`line-hex-100k` 654 → 307 ms); colour parsing up to 41× |
| `d1a9e7b` | Role coalescing without per-row arrays | Parse 1.22–1.37× on point, line and mixed tables; neutral on polygons |
| `a093c4e` | Bounds without sorting every longitude | Bounds 6–20× (`polygon-wkt-numeric-100k` 518 → 87 ms); parse 1.2–1.4× |
| `fccb591` | Reuse H3 cells across renders and the legend | Per render with H3 on (31,704 points): layer build 34.6 → 1.1 ms, legend 39.2 → 3.4 ms |
| `2a78519` | `WKTLoader.parseTextSync` directly | WKT decode 1.18–1.31× |

Combined, Node parse against 1.9.0.2 (interleaved A/B, best of two rounds): `arc-numeric-100k` 637 → 285 ms (2.2×), `scatter-numeric-timed-100k` 333 → 220 ms (1.5×), `hamilton-od-arc-numeric` 13.2 → 7.6 ms (1.7×).

### Chrome, interleaved A/B against the rebuilt 1.9.0.2 visual.js

Best of 6 runs per build (two alternating rounds of three).

| Scenario | Data change → first draw | Parse | deck.gl layer updates |
|---|---:|---:|---:|
| arc-numeric-100k | 367 → 238 ms | 282 → 151 ms | 27 → 28 ms |
| roads-x44 (99,352 WKP paths) | 804 → 483 ms | 622 → 326 ms | 102 → 98 ms |
| polygon-wkp-numeric-100k | 1,647 → 981 ms | 1,035 → 434 ms | 413 → 446 ms |
| hamilton-multigeometry | 186 → 168 ms | 37 → 25 ms | 106 → 99 ms |

The single run below put `arc-numeric-100k`, `roads-x44` and several deck.gl layer-update times on the slow side. The interleaved runs above show those were machine noise: deck.gl code did not change, and its layer-update time is flat when the builds alternate.

### Single run, all scenarios, baseline → Phase 2 (median of 3 per build, ms)

| Scenario | Rows | update() | of which parse | layer build + legend | deck first frame CPU | of which layer updates | heaviest sublayer | Data change → first draw (GPU synced) | JS heap Δ MB |
|---|---:|---:|---:|---:|---:|---:|---|---:|---:|
| hamilton-crash-scatter | 31,704 | 185 → 105 | 164 → 97.2 | 8.60 → 2.50 | 16.7 → 14.2 | 14.8 → 12.4 | scatterplot-layer-base 12.4 | 211 → 131 | 40 |
| hamilton-crash-heatmap | 31,704 | 188 → 114 | 167 → 104 | 8.60 → 3.10 | 27.0 → 27.7 | 26.4 → 26.9 | scatter-heatmap-layer-base 22.0 | 510 → 432 | 40 |
| hamilton-crash-h3 | 31,704 | 376 → 182 | 193 → 121 | 81.4 → 3.20 | 15.7 → 15.8 | 13.0 → 13.2 | h3-hexagon-layer-base-hexagon-cell 11.5 | 397 → 203 | 28 |
| hamilton-earthquake-animation | 20,326 | 129 → 80.3 | 109 → 67.8 | 4.60 → 1.10 | 18.6 → 19.6 | 16.7 → 17.9 | scatterplot-layer-base-temporal 17.9 | 152 → 105 | 14 |
| hamilton-road-path-categorical | 2,258 | 39.8 → 25.1 | 31.2 → 17.5 | 0.80 → 0.40 | 19.1 → 15.2 | 18.2 → 14.0 | path-layer-base-linestrings 12.5 | 65.1 → 46.2 | 25 |
| hamilton-place-polygon-numeric | 68 | 14.5 → 11.4 | 6.40 → 3.50 | 0.20 → 0.30 | 21.7 → 19.5 | 20.4 → 18.2 | polygon-layer-base-polygons-fill 17.5 | 42.5 → 39.2 | 14 |
| hamilton-od-arc-numeric | 2,324 | 25.8 → 22.9 | 16.6 → 13.8 | 0.60 → 0.60 | 12.8 → 11.3 | 11.9 → 10.3 | arc-layer-base 10.3 | 53.6 → 48.7 | 23 |
| hamilton-ferry-line | 47 | 5.40 → 5.00 | 1.90 → 1.60 | 0.10 → 0.10 | 9.00 → 9.40 | 7.30 → 7.50 | line-layer-base 7.50 | 28.3 → 28.7 | 2 |
| hamilton-traffic-points | 39 | 9.30 → 9.10 | 1.80 → 1.60 | 0.20 → 0.20 | 8.60 → 9.50 | 7.10 → 7.80 | scatterplot-layer-base 7.80 | 27.6 → 28.9 | 3 |
| hamilton-multigeometry | 2,313 | 60.3 → 44.0 | 38.9 → 25.4 | 1.10 → 1.00 | 74.9 → 123 | 67.0 → 111 | feature-label-layer-base 36.7 | 148 → 180 | -11 |
| hamilton-stacked-prisms | 340 | 13.7 → 11.9 | 9.40 → 7.10 | 0.40 → 0.20 | 17.2 → 20.8 | 15.9 → 19.3 | polygon-layer-base-polygons-fill 18.3 | 35.1 → 40.5 | 11 |
| scatter-numeric-timed-10k | 10,000 | 34.5 → 31.0 | 26.3 → 22.1 | 0.70 → 0.90 | 15.3 → 15.5 | 13.7 → 13.8 | scatterplot-layer-base-temporal 13.8 | 54.0 → 50.4 | 16 |
| line-hex-10k | 10,000 | 50.4 → 27.3 | 42.4 → 22.4 | 2.30 → 0.90 | 10.9 → 10.9 | 9.20 → 9.20 | line-layer-base 9.20 | 65.3 → 42.2 | 16 |
| arc-numeric-10k | 10,000 | 44.0 → 36.0 | 35.0 → 25.7 | 0.90 → 1.30 | 12.7 → 11.6 | 11.6 → 10.5 | arc-layer-base 10.5 | 70.2 → 61.1 | 21 |
| path-wkp-categorical-10k | 10,000 | 68.2 → 52.1 | 58.4 → 42.2 | 1.70 → 1.40 | 18.5 → 22.7 | 17.3 → 21.5 | path-layer-base-linestrings 18.4 | 99.2 → 87.4 | 35 |
| polygon-wkp-numeric-10k | 10,000 | 105 → 59.1 | 92.0 → 49.5 | 3.00 → 1.60 | 61.1 → 58.6 | 59.5 → 57.2 | polygon-layer-base-polygons-fill 37.7 | 185 → 135 | 63 |
| prism-wkt-hex-10k | 10,000 | 110 → 58.3 | 97.5 → 52.0 | 4.40 → 1.50 | 30.3 → 29.0 | 28.8 → 27.4 | polygon-layer-base-polygons-fill 25.5 | 145 → 92.2 | 42 |
| mixed-wkt-numeric-10k | 10,000 | 117 → 80.9 | 100 → 65.1 | 4.50 → 2.30 | 48.5 → 48.7 | 44.4 → 45.6 | polygon-layer-base-polygons-fill 18.6 | 177 → 141 | 43 |
| scatter-numeric-timed-100k | 100,000 | 226 → 180 | 207 → 158 | 4.20 → 4.80 | 37.9 → 40.7 | 35.9 → 38.2 | scatterplot-layer-base-temporal 38.2 | 275 → 232 | 91 |
| line-hex-100k | 100,000 | 432 → 366 | 378 → 334 | 25.5 → 13.5 | 25.3 → 55.4 | 23.3 → 51.0 | line-layer-base 51.0 | 466 → 431 | 63 |
| arc-numeric-100k | 100,000 | 320 → 443 | 296 → 384 | 8.70 → 17.3 | 29.5 → 67.2 | 28.3 → 64.3 | arc-layer-base 64.3 | 379 → 547 | 47 |
| path-wkp-categorical-100k | 100,000 | 605 → 315 | 564 → 285 | 17.1 → 11.4 | 90.8 → 88.4 | 89.5 → 86.1 | path-layer-base-linestrings 81.1 | 735 → 440 | 266 |
| polygon-wkp-numeric-100k | 100,000 | 948 → 488 | 879 → 453 | 30.1 → 9.80 | 383 → 519 | 385 → 485 | polygon-layer-base-polygons-fill 326 | 1394 → 1076 | 666 |
| prism-wkt-hex-100k | 100,000 | 1005 → 621 | 911 → 594 | 46.2 → 8.70 | 144 → 151 | 142 → 149 | polygon-layer-base-polygons-fill 135 | 1163 → 781 | 288 |
| mixed-wkt-numeric-100k | 100,000 | 1043 → 683 | 939 → 613 | 44.6 → 27.6 | 154 → 189 | 149 → 182 | polygon-layer-base-polygons-fill 103 | 1221 → 899 | 292 |
| scatter-numeric-timed-500k | 500,000 | 1237 → 863 | 1168 → 802 | 28.2 → 22.5 | 104 → 112 | 101 → 109 | scatterplot-layer-base-temporal 109 | 1361 → 998 | 473 |
| line-hex-500k | 500,000 | 2158 → 847 | 1920 → 787 | 114 → 24.5 | 119 → 79.1 | 116 → 76.5 | line-layer-base 76.5 | 2311 → 949 | 456 |
| arc-numeric-500k | 500,000 | 1745 → 1111 | 1570 → 999 | 93.2 → 48.7 | 119 → 123 | 117 → 122 | arc-layer-base 122 | 1979 → 1336 | 509 |
| path-wkp-categorical-500k | 500,000 | 3321 → 2004 | 3130 → 1903 | 91.8 → 39.3 | 456 → 582 | 453 → 582 | path-layer-base-linestrings 556 | 3992 → 2727 | 1254 |
| polygon-wkp-numeric-500k | 500,000 | 5420 → 2711 | 4994 → 2595 | 215 → 47.9 | 1729 → 2290 | 1737 → 2286 | polygon-layer-base-polygons-fill 1439 | 7543 → 5309 | 2995 |
| prism-wkt-hex-500k | 500,000 | 5544 → 3013 | 5042 → 2908 | 245 → 46.0 | 566 → 1007 | 564 → 996 | polygon-layer-base-polygons-fill 936 | 6156 → 4052 | 1317 |
| mixed-wkt-numeric-500k | 500,000 | 5676 → 3941 | 4928 → 3503 | 300 → 236 | 680 → 986 | 677 → 1010 | polygon-layer-base-polygons-fill 509 | 6438 → 4989 | 1193 |
| roads-x44 | 99,352 | 752 → 760 | 709 → 720 | 17.9 → 10.1 | 112 → 247 | 111 → 247 | path-layer-base-linestrings 234 | 910 → 1049 | 396 |

### Animation frame time after Phase 2

| Scenario | Rows | Visual tick p50 / p95 ms | deck frame p50 / p95 ms | rAF interval p50 / p95 ms | Dropped frames |
|---|---:|---:|---:|---:|---:|
| hamilton-earthquake-animation | 20,326 | 0.10 / 0.50 | 0.80 / 1.10 | 16.7 / 16.7 | 0.3% |
| scatter-numeric-timed-100k | 100,000 | 0.10 / 0.20 | 0.80 / 1.00 | 16.7 / 16.7 | 0.0% |
| scatter-numeric-timed-500k | 500,000 | 0.10 / 0.20 | 0.70 / 0.90 | 16.7 / 16.7 | 0.0% |
| path-wkp-categorical-timed-100k | 100,000 | 0.10 / 0.20 | 0.60 / 0.80 | 33.3 / 33.4 | 71.4% |


## Baseline results

### Stage timings, Chrome (median ms)

| Scenario | Rows | Parse | WKT | WKP | Colour parse ×1 | Validate | Bounds | Quantile | Jenks | H3 r7 | Time mask (CPU ref) | Layer build | Colour accessors | Legend |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hamilton-crash-scatter | 31,704 | 107 | – | – | 6.10 | 0.80 | 7.90 | – | – | 27.5 | – | 0.60 | 0.20 | 8.50 |
| hamilton-crash-heatmap | 31,704 | 98.4 | – | – | 6.00 | 0.80 | 7.60 | – | – | 26.4 | – | 0.50 | 0.00 | 8.20 |
| hamilton-crash-h3 | 31,704 | 101 | – | – | 5.70 | 0.80 | 7.40 | – | – | 26.9 | – | 27.0 | 0.00 | 34.5 |
| hamilton-earthquake-animation | 20,326 | 64.6 | – | – | 3.90 | 0.50 | 4.50 | – | – | 18.0 | 0.10 | 0.40 | 0.10 | 5.50 |
| hamilton-road-path-categorical | 2,258 | 16.2 | – | 3.10 | 0.20 | 0.30 | 5.50 | – | – | – | – | 0.20 | 0.10 | 0.50 |
| hamilton-place-polygon-numeric | 68 | 2.60 | – | 0.50 | 0.00 | 0.10 | 1.40 | 0.00 | 0.10 | – | – | 0.20 | 0.00 | 0.10 |
| hamilton-od-arc-numeric | 2,324 | 6.90 | – | – | 0.00 | 0.10 | 1.00 | 0.20 | 34.9 | – | – | 0.40 | 0.20 | 0.40 |
| hamilton-ferry-line | 47 | 0.40 | – | – | 0.00 | 0.00 | 0.00 | – | – | – | – | 0.10 | 0.00 | 0.10 |
| hamilton-traffic-points | 39 | 0.40 | – | – | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.10 | – | 0.10 | 0.00 | 0.10 |
| hamilton-multigeometry | 2,313 | 21.5 | – | 3.30 | 0.40 | 0.40 | 6.30 | 0.00 | 0.10 | 0.10 | – | 3.30 | 0.10 | 0.90 |
| hamilton-stacked-prisms | 340 | 4.20 | 1.30 | – | 0.20 | 0.00 | 0.30 | – | – | – | – | 0.10 | 0.00 | 0.30 |
| scatter-numeric-timed-10k | 10,000 | 20.4 | – | – | 0.10 | 0.30 | 1.90 | 1.80 | 147 | 8.30 | 0.10 | 0.10 | 0.20 | 0.50 |
| line-hex-10k | 10,000 | 37.1 | – | – | 1.80 | 0.30 | 3.60 | – | – | – | – | 0.20 | 0.00 | 2.20 |
| arc-numeric-10k | 10,000 | 28.0 | – | – | 0.20 | 0.30 | 3.80 | 1.90 | 142 | – | – | 0.10 | 0.40 | 0.80 |
| path-wkt-categorical-10k | 10,000 | 79.1 | 39.7 | – | 1.00 | 0.80 | 13.1 | – | – | – | – | 0.30 | 0.30 | 1.40 |
| path-wkp-categorical-10k | 10,000 | 52.4 | – | 10.7 | 1.00 | 0.80 | 14.2 | – | – | – | – | 0.20 | 0.20 | 1.50 |
| polygon-wkt-numeric-10k | 10,000 | 147 | 74.9 | – | 1.70 | 1.40 | 25.4 | 1.80 | 120 | – | – | 0.40 | 0.60 | 3.10 |
| polygon-wkp-numeric-10k | 10,000 | 79.6 | – | 11.3 | 1.70 | 1.30 | 25.4 | 1.80 | 140 | – | – | 0.20 | 0.20 | 2.80 |
| prism-wkt-hex-10k | 10,000 | 85.4 | 31.8 | – | 3.40 | 0.60 | 7.60 | – | – | – | – | 0.20 | 0.30 | 4.30 |
| mixed-wkt-numeric-10k | 10,000 | 85.3 | 24.1 | – | 1.20 | 0.60 | 9.60 | 1.70 | 139 | 1.70 | – | 0.30 | 0.40 | 3.80 |
| scatter-numeric-timed-100k | 100,000 | 193 | – | – | 0.40 | 2.20 | 24.8 | 21.0 | 157 | 84.8 | 0.60 | 1.10 | 1.40 | 4.30 |
| line-hex-100k | 100,000 | 345 | – | – | 17.5 | 2.70 | 53.7 | – | – | – | – | 1.00 | 0.70 | 22.6 |
| arc-numeric-100k | 100,000 | 269 | – | – | 0.30 | 2.90 | 56.6 | 24.5 | 158 | – | – | 1.40 | 4.70 | 8.40 |
| path-wkt-categorical-100k | 100,000 | 849 | 395 | – | 9.60 | 8.10 | 209 | – | – | – | – | 3.50 | 5.00 | 15.6 |
| path-wkp-categorical-100k | 100,000 | 520 | – | 120 | 9.60 | 6.80 | 194 | – | – | – | – | 3.50 | 3.00 | 14.3 |
| polygon-wkt-numeric-100k | 100,000 | 1514 | 735 | – | 18.2 | 15.4 | 375 | 23.0 | 138 | – | – | 3.70 | 12.5 | 30.3 |
| polygon-wkp-numeric-100k | 100,000 | 878 | – | 151 | 18.5 | 14.5 | 351 | 23.2 | 160 | – | – | 1.40 | 2.90 | 29.0 |
| prism-wkt-hex-100k | 100,000 | 850 | 324 | – | 36.1 | 5.60 | 118 | – | – | – | – | 1.90 | 5.80 | 48.0 |
| mixed-wkt-numeric-100k | 100,000 | 887 | 246 | – | 11.0 | 6.90 | 145 | 22.1 | 161 | 16.8 | – | 2.30 | 10.2 | 42.4 |
| scatter-numeric-timed-500k | 500,000 | 1079 | – | – | 0.80 | 11.8 | 173 | 140 | 274 | 470 | 2.80 | 6.20 | 5.10 | 33.9 |
| line-hex-500k | 500,000 | 1853 | – | – | 88.7 | 14.2 | 304 | – | – | – | – | 8.40 | 3.90 | 139 |
| arc-numeric-500k | 500,000 | 1438 | – | – | 1.50 | 14.6 | 316 | 137 | 276 | – | – | 8.30 | 23.7 | 73.7 |
| path-wkt-categorical-500k | 500,000 | 4286 | 2077 | – | 54.8 | 70.8 | 1263 | – | – | – | – | 18.2 | 21.4 | 96.8 |
| path-wkp-categorical-500k | 500,000 | 2989 | – | 667 | 52.6 | 58.4 | 1224 | – | – | – | – | 18.1 | 16.4 | 87.9 |
| polygon-wkt-numeric-500k | 500,000 | 8075 | 4500 | – | 103 | 131 | 3148 | 183 | 337 | – | – | 18.7 | 66.7 | 250 |
| polygon-wkp-numeric-500k | 500,000 | 4912 | – | 815 | 116 | 103 | 2156 | 208 | 372 | – | – | 7.70 | 26.3 | 237 |
| prism-wkt-hex-500k | 500,000 | 4873 | 2031 | – | 261 | 50.1 | 928 | – | – | – | – | 12.0 | 34.7 | 381 |
| mixed-wkt-numeric-500k | 500,000 | 6575 | 1552 | – | 96.8 | 52.8 | 985 | 222 | 353 | 130 | – | 12.8 | 77.7 | 524 |
| tiled-roads-x44 | 99,352 | 755 | – | 184 | 18.3 | 18.9 | 321 | – | – | – | – | 4.30 | 3.70 | 26.7 |

### Stage timings, Node v26.0.0 (median ms)

| Scenario | Rows | Parse | WKT | WKP | Colour parse ×1 | Validate | Bounds | Quantile | Jenks | H3 r7 | Time mask (CPU ref) | Layer build | Colour accessors | Legend |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hamilton-crash-scatter | 31,704 | 121 | – | – | 7.02 | 0.86 | 7.31 | – | – | 20.4 | – | 0.81 | 0.32 | 9.77 |
| hamilton-crash-heatmap | 31,704 | 119 | – | – | 7.20 | 1.20 | 7.81 | – | – | 20.1 | – | 0.73 | 0.01 | 10.2 |
| hamilton-crash-h3 | 31,704 | 127 | – | – | 7.94 | 1.33 | 8.50 | – | – | 22.4 | – | 24.5 | 0.04 | 34.2 |
| hamilton-earthquake-animation | 20,326 | 86.3 | – | – | 5.22 | 0.78 | 4.68 | – | – | 16.6 | 0.03 | 0.54 | 0.21 | 7.24 |
| hamilton-road-path-categorical | 2,258 | skipped: WKP decoding needs the browser harness (the patched WKP loader throws in Node). |
| hamilton-place-polygon-numeric | 68 | skipped: WKP decoding needs the browser harness (the patched WKP loader throws in Node). |
| hamilton-od-arc-numeric | 2,324 | 9.69 | – | – | 0.13 | 0.23 | 0.91 | 0.13 | 27.1 | – | – | 0.58 | 0.36 | 0.38 |
| hamilton-ferry-line | 47 | 0.42 | – | – | 0.02 | 0.02 | 0.04 | – | – | – | – | 0.12 | 0.01 | 0.09 |
| hamilton-traffic-points | 39 | 0.40 | – | – | 0.02 | 0.01 | 0.01 | 0.01 | 0.07 | 0.05 | – | 0.12 | 0.02 | 0.13 |
| hamilton-multigeometry | 2,313 | skipped: WKP decoding needs the browser harness (the patched WKP loader throws in Node). |
| hamilton-stacked-prisms | 340 | 5.17 | 1.76 | – | 0.21 | 0.14 | 0.34 | – | – | – | – | 0.16 | 0.06 | 0.30 |
| scatter-numeric-timed-10k | 10,000 | 26.3 | – | – | 0.19 | 1.86 | 3.66 | 2.27 | 117 | 10.1 | 0.17 | 0.36 | 1.78 | 1.08 |
| line-hex-10k | 10,000 | 50.7 | – | – | 2.56 | 0.78 | 5.12 | – | – | – | – | 0.30 | 0.50 | 4.30 |
| arc-numeric-10k | 10,000 | 40.4 | – | – | 0.42 | 2.00 | 6.76 | 2.55 | 117 | – | – | 0.31 | 1.58 | 1.66 |
| path-wkt-categorical-10k | 10,000 | 121 | 58.6 | – | 1.78 | 2.08 | 21.0 | – | – | – | – | 0.64 | 1.10 | 2.78 |
| polygon-wkt-numeric-10k | 10,000 | 196 | 103 | – | 3.34 | 4.39 | 46.1 | 2.79 | 128 | – | – | 0.40 | 1.26 | 5.37 |
| prism-wkt-hex-10k | 10,000 | 145 | 59.7 | – | 7.17 | 2.61 | 16.1 | – | – | – | – | 0.30 | 0.48 | 9.57 |
| mixed-wkt-numeric-10k | 10,000 | 143 | 47.2 | – | 2.62 | 2.94 | 18.5 | 3.16 | 133 | 2.49 | – | 0.64 | 2.74 | 7.39 |
| scatter-numeric-timed-100k | 100,000 | 314 | – | – | 1.27 | 6.80 | 47.1 | 37.3 | 165 | 123 | 0.94 | 2.69 | 4.09 | 11.5 |
| line-hex-100k | 100,000 | 654 | – | – | 39.6 | 9.35 | 88.5 | – | – | – | – | 2.82 | 2.40 | 56.3 |
| arc-numeric-100k | 100,000 | 500 | – | – | 2.93 | 8.95 | 91.1 | 43.8 | 181 | – | – | 2.53 | 9.05 | 24.6 |
| path-wkt-categorical-100k | 100,000 | 1312 | 714 | – | 25.1 | 19.7 | 325 | – | – | – | – | 5.91 | 11.5 | 38.3 |
| polygon-wkt-numeric-100k | 100,000 | 2519 | 1135 | – | 46.0 | 39.3 | 525 | 39.0 | 205 | – | – | 3.06 | 5.81 | 75.6 |
| prism-wkt-hex-100k | 100,000 | 1403 | 553 | – | 84.0 | 19.9 | 198 | – | – | – | – | 2.19 | 3.59 | 105 |
| mixed-wkt-numeric-100k | 100,000 | 1432 | 435 | – | 30.3 | 19.2 | 214 | 43.3 | 194 | 29.2 | – | 2.98 | 11.6 | 109 |
| scatter-numeric-timed-500k | 500,000 | 1662 | – | – | 8.98 | 25.5 | 251 | 216 | 350 | 577 | 5.54 | 12.5 | 18.9 | 114 |
| line-hex-500k | 500,000 | 2937 | – | – | 179 | 40.3 | 443 | – | – | – | – | 8.81 | 11.1 | 232 |
| arc-numeric-500k | 500,000 | 2205 | – | – | 14.6 | 41.3 | 426 | 208 | 337 | – | – | 11.2 | 50.3 | 164 |
| path-wkt-categorical-500k | 500,000 | 6409 | 3203 | – | 117 | 99.0 | 1982 | – | – | – | – | 30.1 | 56.0 | 268 |
| polygon-wkt-numeric-500k | 500,000 | 12703 | 5446 | – | 211 | 263 | 2956 | 349 | 508 | – | – | 14.4 | 31.6 | 491 |
| prism-wkt-hex-500k | 500,000 | 8160 | 2555 | – | 378 | 139 | 990 | – | – | – | – | 9.43 | 21.7 | 523 |
| mixed-wkt-numeric-500k | 500,000 | 6095 | 1603 | – | 119 | 82.9 | 920 | 209 | 324 | 122 | – | 15.7 | 71.9 | 574 |

### End to end, packaged visual.js in Chrome (median of runs, ms)

| Scenario | Rows | update() | of which parse | layer build + legend | deck first frame CPU | of which layer updates | heaviest sublayer | Data change → first draw (GPU synced) | JS heap Δ MB |
|---|---:|---:|---:|---:|---:|---:|---|---:|---:|
| hamilton-crash-scatter | 31,704 | 185 | 164 | 8.60 | 16.7 | 14.8 | scatterplot-layer-base 14.8 | 211 | 39 |
| hamilton-crash-heatmap | 31,704 | 188 | 167 | 8.60 | 27.0 | 26.4 | scatter-heatmap-layer-base 22.7 | 510 | 36 |
| hamilton-crash-h3 | 31,704 | 376 | 193 | 81.4 | 15.7 | 13.0 | h3-hexagon-layer-base-hexagon-cell 11.4 | 397 | 43 |
| hamilton-earthquake-animation | 20,326 | 129 | 109 | 4.60 | 18.6 | 16.7 | scatterplot-layer-base-temporal 16.7 | 152 | 32 |
| hamilton-road-path-categorical | 2,258 | 39.8 | 31.2 | 0.80 | 19.1 | 18.2 | path-layer-base-linestrings 16.5 | 65.1 | -7 |
| hamilton-place-polygon-numeric | 68 | 14.5 | 6.40 | 0.20 | 21.7 | 20.4 | polygon-layer-base-polygons-fill 19.7 | 42.5 | 17 |
| hamilton-od-arc-numeric | 2,324 | 25.8 | 16.6 | 0.60 | 12.8 | 11.9 | arc-layer-base 11.9 | 53.6 | 26 |
| hamilton-ferry-line | 47 | 5.40 | 1.90 | 0.10 | 9.00 | 7.30 | line-layer-base 7.30 | 28.3 | 3 |
| hamilton-traffic-points | 39 | 9.30 | 1.80 | 0.20 | 8.60 | 7.10 | scatterplot-layer-base 7.10 | 27.6 | 3 |
| hamilton-multigeometry | 2,313 | 60.3 | 38.9 | 1.10 | 74.9 | 67.0 | feature-label-layer-base 23.7 | 148 | 5 |
| hamilton-stacked-prisms | 340 | 13.7 | 9.40 | 0.40 | 17.2 | 15.9 | polygon-layer-base-polygons-fill 15.0 | 35.1 | 14 |
| scatter-numeric-timed-10k | 10,000 | 34.5 | 26.3 | 0.70 | 15.3 | 13.7 | scatterplot-layer-base-temporal 13.7 | 54.0 | 14 |
| line-hex-10k | 10,000 | 50.4 | 42.4 | 2.30 | 10.9 | 9.20 | line-layer-base 9.20 | 65.3 | 22 |
| arc-numeric-10k | 10,000 | 44.0 | 35.0 | 0.90 | 12.7 | 11.6 | arc-layer-base 11.6 | 70.2 | 22 |
| path-wkp-categorical-10k | 10,000 | 68.2 | 58.4 | 1.70 | 18.5 | 17.3 | path-layer-base-linestrings 15.8 | 99.2 | 43 |
| polygon-wkp-numeric-10k | 10,000 | 105 | 92.0 | 3.00 | 61.1 | 59.5 | polygon-layer-base-polygons-fill 41.6 | 185 | 75 |
| prism-wkt-hex-10k | 10,000 | 110 | 97.5 | 4.40 | 30.3 | 28.8 | polygon-layer-base-polygons-fill 26.6 | 145 | 59 |
| mixed-wkt-numeric-10k | 10,000 | 117 | 100 | 4.50 | 48.5 | 44.4 | polygon-layer-base-polygons-fill 17.3 | 177 | 66 |
| scatter-numeric-timed-100k | 100,000 | 226 | 207 | 4.20 | 37.9 | 35.9 | scatterplot-layer-base-temporal 35.9 | 275 | 46 |
| line-hex-100k | 100,000 | 432 | 378 | 25.5 | 25.3 | 23.3 | line-layer-base 23.3 | 466 | 112 |
| arc-numeric-100k | 100,000 | 320 | 296 | 8.70 | 29.5 | 28.3 | arc-layer-base 28.3 | 379 | 95 |
| path-wkp-categorical-100k | 100,000 | 605 | 564 | 17.1 | 90.8 | 89.5 | path-layer-base-linestrings 81.9 | 735 | 351 |
| polygon-wkp-numeric-100k | 100,000 | 948 | 879 | 30.1 | 383 | 385 | polygon-layer-base-polygons-fill 260 | 1394 | 705 |
| prism-wkt-hex-100k | 100,000 | 1005 | 911 | 46.2 | 144 | 142 | polygon-layer-base-polygons-fill 127 | 1163 | 227 |
| mixed-wkt-numeric-100k | 100,000 | 1043 | 939 | 44.6 | 154 | 149 | polygon-layer-base-polygons-fill 80.5 | 1221 | 377 |
| scatter-numeric-timed-500k | 500,000 | 1237 | 1168 | 28.2 | 104 | 101 | scatterplot-layer-base-temporal 101 | 1361 | 770 |
| line-hex-500k | 500,000 | 2158 | 1920 | 114 | 119 | 116 | line-layer-base 116 | 2311 | 259 |
| arc-numeric-500k | 500,000 | 1745 | 1570 | 93.2 | 119 | 117 | arc-layer-base 117 | 1979 | 384 |
| path-wkp-categorical-500k | 500,000 | 3321 | 3130 | 91.8 | 456 | 453 | path-layer-base-linestrings 431 | 3992 | 1143 |
| polygon-wkp-numeric-500k | 500,000 | 5420 | 4994 | 215 | 1729 | 1737 | polygon-layer-base-polygons-fill 1073 | 7543 | 2867 |
| prism-wkt-hex-500k | 500,000 | 5544 | 5042 | 245 | 566 | 564 | polygon-layer-base-polygons-fill 508 | 6156 | 1768 |
| mixed-wkt-numeric-500k | 500,000 | 5676 | 4928 | 300 | 680 | 677 | polygon-layer-base-polygons-fill 353 | 6438 | 1665 |
| roads-x44 | 99,352 | 752 | 709 | 17.9 | 112 | 111 | path-layer-base-linestrings 105 | 910 | 489 |

### Animation frame time

| Scenario | Rows | Visual tick p50 / p95 ms | deck frame p50 / p95 ms | rAF interval p50 / p95 ms | Dropped frames |
|---|---:|---:|---:|---:|---:|
| hamilton-earthquake-animation | 20,326 | 0.10 / 0.30 | 0.60 / 0.90 | 16.7 / 16.7 | 0.0% |
| scatter-numeric-timed-100k | 100,000 | 0.10 / 0.20 | 0.60 / 0.90 | 16.7 / 16.8 | 0.0% |
| scatter-numeric-timed-500k | 500,000 | 0.00 / 0.20 | 0.40 / 1.00 | 16.7 / 16.7 | 0.0% |
| path-wkp-categorical-timed-100k | 100,000 | 0.00 / 0.10 | 0.10 / 0.20 | 33.3 / 33.4 | 53.6% |
