# Cartis

> A high-resolution, purely client-side map poster generator — search a location, style it, layer data on top, and export a print-ready file. No backend, no server-side rendering.

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](#)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](#)
[![MapLibre GL JS](https://img.shields.io/badge/MapLibre_GL_JS-5-396C90)](#)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900?logo=leaflet&logoColor=white)](#)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#license)
[![Status](https://img.shields.io/badge/status-active_development-orange)](#project-status)

---

## About The Project

Cartis turns a map into a poster. You search a city or drop in coordinates, pick a rendering style — anything from a plain street map to a hand-tuned procedural art palette — layer routes, markers, transit lines, terrain contours, or your own GPS track on top, and export the result at print resolution (up to 24×36" at 300 DPI).

The interesting engineering problem here isn't the UI — it's that **everything happens in the browser**. There's no server compositing the final image, no backend rendering pipeline. The app runs two different map rendering engines side by side (Leaflet for raster tile styles, MapLibre GL JS for procedurally-colored vector styles), keeps their viewports in sync, and then — for export — reconstructs the entire poster (map imagery, markers, routes, typography, frame, vignette) as a single canvas composited entirely with the Canvas 2D API. No screenshot library, no DOM-to-image hack.

It started as a straightforward JS poster tool and has been rebuilt incrementally into a typed, modular TypeScript codebase with a meaningfully larger feature set: 3D buildings, real client-side-generated contour lines from public elevation data, live transit overlays from OpenStreetMap, GPX/GeoJSON import, heatmaps, and multi-format export (PNG/PDF/SVG).


## Project Type

Client-side web application / geospatial data visualization tool.

## Project Status

**Active development.** The core engine (map rendering, routing, marker/route interaction, canvas-based export pipeline) has been ported and typed end-to-end. Several newer features (contour generation, transit overlays, batch export) are functionally complete but have not yet been verified against a running browser — see [Known Issues](#known-issues) for specifics rather than a vague disclaimer.

## Why I Built This

I wanted a project that forced me past "call an API, render the response" — something where the hard part is genuinely in the browser: coordinating two independent map rendering engines without them fighting each other, reconstructing a styled composition pixel-for-pixel on canvas instead of leaning on a screenshot library, and doing real geospatial math (Web Mercator projections, marching-squares contour extraction from elevation rasters) client-side with no backend to hide the work behind.

It's also a deliberately incremental rewrite: the original version was untyped JavaScript with a single 1,500+ line file wiring the entire UI. Rebuilding it in strict TypeScript, phase by phase, was as much about *fixing that* as it was about adding features — which is why the README below is honest about what's still one large file (`ui/form.ts`) and hasn't been split into the cleaner module structure the rest of the app already has.

## Features

### Core Features
- Global geocoding search (Nominatim) with debounced autocomplete
- Dual rendering modes: raster tile basemaps (Leaflet) and procedurally-colored vector art styles (MapLibre GL JS), switchable live
- 30+ built-in artistic themes plus a custom theme builder with **live color-picker preview** directly on the map before saving
- Manual routes (draggable start/end/via points, OSRM-routed) and route-drawing via click-to-plot
- GPX and GeoJSON track import
- Custom labeled POI pins (address search → geocoded pin + label)
- Bulk heatmap layer from uploaded CSV/JSON coordinate data
- Live transit line overlay (subway/rail/tram) fetched from the Overpass API for the current viewport
- Client-side generated contour lines from public elevation tiles (marching squares over decoded terrain-RGB data — not a canned hillshade)
- 3D building extrusion, lat/lon graticule, water/land color inversion
- Mat framing, print border, museum-margin preset, bleed guide, scale bar, compass rose
- Multi-format export: PNG, PDF (print-DPI-sized), SVG (vector text/frame over a rasterized map)
- Batch export across multiple output presets, zipped
- Shareable compressed state URLs (`CompressionStream` gzip → base64url)

### Engineering Features
- Strict TypeScript throughout (`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`)
- Typed observable store — plain pub/sub, no framework, no external state library
- Canvas-native export compositor: no `html2canvas`, no DOM screenshotting anywhere in the export path
- Single source of truth for output-size clamping (map snapshot and overlay renderer can't drift out of sync on very large exports)

### Security Features
- No backend, no user data leaves the browser except outbound requests to Nominatim/OSRM/Overpass/the elevation tile host/CARTO basemaps (public third-party APIs; CARTO raster tiles take an optional client-side key)
- No `eval`, no dynamic script injection; uploaded files (GPX/GeoJSON/CSV) are parsed as data, never executed

### Performance Features
- iOS/Safari canvas pixel-count clamping applied once and threaded through the whole export pipeline
- Per-viewport caching for Overpass (transit) and elevation tile (contour) fetches, so panning doesn't refire requests on every frame

### Developer Experience Features
- Modular file layout (`core/`, `map/leaflet-and-maplibre-specific/`, `export/`, `ui/`) — most files under 300 lines, each with a single clear responsibility
- No build step beyond `vite build` — no codegen, no monorepo tooling

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Build tool | **Vite 5** | Fast dev server, zero-config TS/ESM, trivial static deploy |
| Language | **TypeScript (strict)** | This is a data-shape-heavy app (map state, theme objects, GeoJSON) — the type system catches a large class of "wrong field name" bugs that a JS rewrite of this size would otherwise hide until runtime |
| Styling | **Tailwind CSS** | Utility-first matched the original design system being preserved through the rewrite; no custom CSS framework to maintain |
| Raster maps | **Leaflet 1.9** | Mature, small, exactly what's needed for simple tile-layer basemaps |
| Vector maps | **MapLibre GL JS 5** | Only real option for client-side vector tile rendering, procedural style recoloring, `fill-extrusion` 3D buildings, and heatmap layers |
| Geocoding | **Nominatim (OpenStreetMap)** | Free, keyless, sufficient accuracy for a poster tool (not a production geocoder at scale) |
| Routing | **OSRM public API** | Free, keyless driving-route geometry |
| Transit data | **Overpass API** | The only free, keyless way to query OSM tags (`railway=subway` etc.) by bounding box |
| Elevation data | **AWS-hosted Terrarium tiles** | Public, keyless terrain-RGB tileset — makes real client-side contour generation possible without a paid DEM provider |
| PDF export | **jsPDF** | Smallest reliable client-side PDF assembler; only used to embed a raster image, not for its HTML-rendering plugin |
| Batch export | **JSZip** | Standard client-side zip packaging |
| Deployment target | **Any static host** (Vercel/Netlify/GitHub Pages) | No backend means no infrastructure decision to make |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser Tab                          │
│                                                                │
│  ┌──────────────┐        ┌───────────────────────────────┐  │
│  │   ui/form.ts │◄──────►│      core/store.ts             │  │
│  │  (DOM wiring, │  read/  │  (plain observable object,     │  │
│  │   event       │  write  │   subscribe/updateState)       │  │
│  │   listeners)  │        └──────────────┬──────────────────┘  │
│  └──────┬───────┘                       │ notifies             │
│         │ calls                          ▼                     │
│         │                    ┌────────────────────────┐        │
│         ▼                    │   main.ts subscribe()   │        │
│  ┌──────────────┐            │  fans out state changes │        │
│  │ map/map-init  │◄──────────┤  to every renderer/     │        │
│  │  .ts          │            │  overlay module         │        │
│  │ (coordinates  │            └────────────────────────┘        │
│  │  both engines)│                                               │
│  └──┬─────────┬──┘                                               │
│     │         │                                                  │
│     ▼         ▼                                                  │
│  ┌──────┐  ┌────────────┐        ┌─────────────────────────┐   │
│  │Leaflet│  │ MapLibre   │        │  export/                 │   │
│  │(raster│  │ GL JS      │        │  composePosterCanvas()   │   │
│  │ tiles)│  │ (vector +  │──────► │  → captures map snapshot │   │
│  └──────┘  │  overlays) │        │  → renders overlay canvas│   │
│            └────────────┘        │  → composites final PNG/ │   │
│                                   │    PDF/SVG                │   │
│                                   └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
        │              │                │              │
        ▼              ▼                ▼              ▼
   Nominatim        OSRM          Overpass API    Terrarium DEM
  (geocoding)     (routing)       (transit data)   (elevation)
```

**Request lifecycle for a state change** (e.g. dragging the zoom slider): DOM event in `form.ts` → `updateState()` mutates the store and persists the relevant slice to `localStorage` → the store notifies all subscribers → `main.ts`'s single subscription fans that out to the active map renderer, marker/route managers, and (if in artistic mode) the MapLibre overlay orchestrator → each module does its own idempotent "does this actually need to change?" check before touching the DOM/canvas.

**Export lifecycle**: `composePosterCanvas()` clamps the target resolution once (shared iOS canvas pixel-count ceiling), captures the current map as a canvas (resizing the MapLibre container off-screen for artistic mode, or manually redrawing visible Leaflet tiles for raster mode), renders the typography/frame/scale-bar/compass overlay to a second canvas via direct Canvas 2D drawing (letter-spacing handled by manual per-character positioning, since CSS `letter-spacing` isn't available off-DOM), then composites both onto a final canvas — which PNG, PDF, and batch export all consume identically.

## Deployment Architecture

There is currently no deployed instance. Because this is a 100% static, backend-free app, the intended deployment is trivial:

- **Frontend**: static `dist/` output from `vite build`, servable from Vercel / Netlify / GitHub Pages / any CDN
- **Backend**: none — all data comes from third-party public APIs called directly from the browser
- **Database**: none — persistence is `localStorage` only (poster configuration, custom themes)
- **CI/CD**: not yet set up; `npm run build` + `npm run typecheck` would be the natural gate for a GitHub Actions workflow

## Folder Structure

```
cartis/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── style.css
├── src/
│   ├── main.ts                     # app bootstrap, state subscription, export button wiring
│   ├── types/
│   │   ├── state.ts                # CartisState — the single state shape for the whole app
│   │   └── themes.ts
│   ├── core/
│   │   ├── store.ts                # typed observable store
│   │   ├── persistence.ts          # localStorage load/save
│   │   ├── units.ts                # mm/in/px conversions for print sizing
│   │   ├── scale-bar.ts            # Web Mercator distance math
│   │   ├── print-safety.ts         # heuristic CMYK-unsafe color detection
│   │   ├── share-url.ts            # compressed shareable state URLs
│   │   ├── coordinate-file-import.ts
│   │   ├── carto-key.ts            # optional VITE_CARTO_API_KEY for raster tiles
│   │   └── themes/                 # raster/artistic/custom theme data + CRUD
│   ├── map/
│   │   ├── map-init.ts             # dual Leaflet/MapLibre coordinator
│   │   ├── geocoder.ts
│   │   ├── maplibre/                # MapLibre-only overlays (3D buildings, contours,
│   │   │                            #  graticule, inversion, transit, heatmap, theme preview)
│   │   ├── markers/                 # markers + labeled custom POIs
│   │   └── routes/                  # OSRM routing, GPX/GeoJSON import, draw tool
│   ├── export/
│   │   ├── png-export.ts            # composePosterCanvas() + PNG output
│   │   ├── overlay-renderer.ts      # canvas-native typography/frame renderer
│   │   ├── pdf-export.ts
│   │   ├── svg-overlay-export.ts
│   │   └── batch-export.ts
│   └── ui/
│       └── form.ts                  # sidebar control wiring (see Technical Debt)
```

## Installation

```bash
git clone <repository-url>
cd cartis
npm install
npm run dev        # starts Vite dev server
```

```bash
npm run build       # tsc -b && vite build → dist/
npm run typecheck   # tsc --noEmit only
```

Most services need no keys. CARTO raster themes do — copy `.env.example` to `.env` and set `VITE_CARTO_API_KEY` (see below).

## Environment Variables

Nominatim, OSRM, Overpass, Terrarium, and OpenFreeMap stay keyless. **CARTO raster tiles** (Midnight Dark, Minimal White, Modern Voyager) now require a free API key or they show an “API key required” watermark.

1. Request a key at [carto.com/basemaps/apikey](https://carto.com/basemaps/apikey)
2. Copy `.env.example` to `.env`
3. Set `VITE_CARTO_API_KEY` to that key
4. Restart `npm run dev`

Do not commit `.env`. Vite inlines `VITE_*` values into the client bundle, and the browser sends the key on every tile request — that is how CARTO authenticates raster tiles. Request your own key rather than reusing one from another project.

Artistic / vector mode is unchanged. CARTO’s free tier also requires OpenStreetMap and [CARTO attribution](https://carto.com/attributions) to stay visible.

## Usage

1. Search for a location or enter coordinates manually.
2. Pick a rendering mode — Standard (raster basemap) or Artistic (procedural vector style) — and a theme.
3. Layer on optional data: a marker, a route, a GPX track, transit lines, a heatmap, custom POIs.
4. Adjust composition: pitch/bearing (artistic mode), overlay text position and size, mat framing, scale bar, compass rose.
5. Pick an output size (social media / wallpaper / print preset, or a custom resolution).
6. Choose PNG, PDF, or SVG and export — or batch-export across the three quick presets at once.
7. Optionally copy a shareable link that reproduces the entire configuration for someone else.

## API Documentation

This project has no backend/API of its own. It's a *consumer* of third-party public APIs:

| Service | Purpose | Example call |
|---|---|---|
| Nominatim | Forward geocoding | `GET https://nominatim.openstreetmap.org/search?format=json&q={query}` |
| OSRM | Route geometry | `GET https://router.project-osrm.org/route/v1/driving/{lon},{lat};{lon},{lat}?overview=full&geometries=geojson` |
| Overpass | Transit ways in a bbox | `POST https://overpass-api.de/api/interpreter` with an Overpass QL query body |
| Terrarium tiles | Elevation raster | `GET https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` |
| CARTO raster tiles | Leaflet basemaps (dark / light / voyager) | `GET https://{s}.basemaps.cartocdn.com/.../{z}/{x}/{y}.png?key={VITE_CARTO_API_KEY}` |


## Tradeoffs & Limitations

- **PDF export is not vector.** MapLibre/Leaflet output has no vector export path, so the PDF embeds a raster JPEG sized to the correct physical print dimensions. This is stated explicitly in the export UI rather than left implicit.
- **SVG export is a hybrid**, not a fully vector file: the map itself is an embedded raster `<image>`; only the text, frame, scale bar, and compass rose are true vector.
- **Contour lines cover a single tile around the map center**, not the full viewport. At zoomed-out compositions, contours will only appear near the middle of the frame rather than edge-to-edge. Multi-tile stitching is the natural next step.
- **Print-safety color warnings are a heuristic** (HSL saturation/lightness thresholding), not an actual RGB→CMYK gamut simulation.
- **Batch export covers three fixed presets** (Square/Portrait/Landscape), not a full custom multi-select picker.
- **Bleed guides are editor-only** — deliberately excluded from the final export, matching how print software normally treats trim/bleed marks as a positioning aid rather than artwork.

## Known Issues

- `ui/form.ts` is still a single ~1,800-line file handling all sidebar control wiring — it was ported as one file to lock in behavior parity quickly, with panel-splitting planned as a follow-up (see Roadmap).
- The full rebuild (Phases 0–6 of the rewrite) has been verified via `tsc --noEmit` and `vite build` at every step, and cross-checked for DOM ID mismatches between the UI code and markup — but **has not yet been exercised in a running browser**. The newer geometry-heavy code (contour marching squares, SVG text layout, scale bar math) is the most likely place for a visual bug to be hiding.
- The draw-path tool has no undo-last-point or click-to-close-loop shortcut.
- No automated tests exist yet (unit or otherwise).

## Technical Debt

- `ui/form.ts` monolith (see above) — highest-priority item.
- No code-splitting: MapLibre GL JS, Leaflet, jsPDF, and JSZip all ship in a single bundle regardless of which export format or render mode is actually used. `import()`-based lazy loading for the export modules and the inactive map engine would meaningfully cut initial load size.
- No test suite. For a project this state-shape-heavy, the highest-leverage first tests would be the pure functions (`core/units.ts`, `core/scale-bar.ts`, `core/print-safety.ts`, the marching-squares contour generator) since they need no DOM/browser mocking.
- Heatmap CSV/JSON parsing runs synchronously on the main thread with no row-count guard — a very large file could momentarily freeze the tab.


## Challenges Faced

- **Keeping two independent map rendering engines in sync** (center/zoom mirrored between Leaflet and MapLibre) without feedback loops — solved with an `isSyncing` guard flag rather than anything more elaborate.
- **Replacing `html2canvas`-based export with a canvas-native compositor** while keeping visual output equivalent — required reimplementing CSS letter-spacing and flex-gap text layout manually in Canvas 2D, since neither is available outside the DOM.
- **Generating real contour lines client-side** from public elevation tiles — decoding Terrarium-encoded PNGs, running marching squares, and converting grid coordinates back to lng/lat, all without a backend to do the heavy lifting.
- **MapLibre GL JS v5's API surface changed** mid-project (`antialias`/`preserveDrawingBuffer` moved from top-level `MapOptions` into a nested `canvasContextAttributes` object) — caught by the type checker rather than a silent runtime failure, which was a good argument in favor of the TypeScript rewrite.

## What I Learned

- How to structure a non-trivial app around a plain observable store instead of reaching for a state management library — and where that pattern's limits are (the "call every relevant update function on every state change, idempotently" approach in `main.ts`'s subscription works, but doesn't scale gracefully as the number of overlays grows).
- The real difference between "the browser can render this" and "the browser can *export* this at 300 DPI" — most of the export-pipeline engineering was about that gap, not about the map itself.
- How much CSS quietly does for you: letter-spacing, flex centering, and text wrapping all had to be reasoned about and reimplemented by hand for the canvas export path.
- The value of incremental, verifiable phases when doing a large rewrite: locking in typecheck + build success at every step made it possible to keep moving without losing track of what was actually verified versus assumed.

## License

Distributed under the MIT License. See `LICENSE` for details.

## Contact

**Heramb Chaudhari**

[![GitHub](https://img.shields.io/badge/GitHub-Heramb1221-black?style=for-the-badge&logo=github)](https://github.com/Heramb1221)

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Heramb%20Chaudhari-blue?style=for-the-badge&logo=linkedin)](https://www.linkedin.com/in/heramb-chaudhari)

[![Email](https://img.shields.io/badge/Email-hchaudhari1221%40gmail.com-red?style=for-the-badge&logo=gmail)](mailto:hchaudhari1221@gmail.com)
