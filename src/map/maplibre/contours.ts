import type maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { ArtisticTheme } from '../../types/themes';

const SOURCE_ID = 'contours-source';
const LAYER_ID = 'contours-layer';

/**
 * Public, keyless terrain-RGB tileset (Terrarium encoding), originally
 * published by Mapzen and now mirrored on AWS's Registry of Open Data.
 * No API key, no backend — fits the "strictly client-side" constraint.
 */
const TERRAIN_TILE_URL = (z: number, x: number, y: number): string => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

/** elevation in meters, per the Terrarium encoding spec */
function decodeTerrarium(r: number, g: number, b: number): number {
	return r * 256 + g + b / 256 - 32768;
}

function lngLatToTileXY(lng: number, lat: number, zoom: number): { x: number; y: number } {
	const n = 2 ** zoom;
	const x = Math.floor(((lng + 180) / 360) * n);
	const latRad = (lat * Math.PI) / 180;
	const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
	return { x, y: Math.max(0, Math.min(n - 1, y)) };
}

function tileXYToLngLat(x: number, y: number, zoom: number): [number, number] {
	const n = 2 ** zoom;
	const lng = (x / n) * 360 - 180;
	const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
	return [lng, (latRad * 180) / Math.PI];
}

function interp(threshold: number, v1: number, v2: number): number {
	if (v2 === v1) return 0.5;
	return (threshold - v1) / (v2 - v1);
}

/** Classic marching squares — returns line segments in fractional grid-cell coordinates. Saddle cases (5, 10) use a fixed, consistent resolution rather than center-sampling — a minor simplification appropriate for decorative poster contours rather than scientific accuracy. */
function marchingSquaresSegments(grid: Float32Array, w: number, h: number, threshold: number): [number, number, number, number][] {
	const segs: [number, number, number, number][] = [];

	for (let y = 0; y < h - 1; y++) {
		for (let x = 0; x < w - 1; x++) {
			const tl = grid[y * w + x]!;
			const tr = grid[y * w + x + 1]!;
			const br = grid[(y + 1) * w + x + 1]!;
			const bl = grid[(y + 1) * w + x]!;

			let idx = 0;
			if (tl > threshold) idx |= 1;
			if (tr > threshold) idx |= 2;
			if (br > threshold) idx |= 4;
			if (bl > threshold) idx |= 8;
			if (idx === 0 || idx === 15) continue;

			const top: [number, number] = [x + interp(threshold, tl, tr), y];
			const right: [number, number] = [x + 1, y + interp(threshold, tr, br)];
			const bottom: [number, number] = [x + interp(threshold, bl, br), y + 1];
			const left: [number, number] = [x, y + interp(threshold, tl, bl)];

			const add = (p1: [number, number], p2: [number, number]) => segs.push([p1[0], p1[1], p2[0], p2[1]]);

			switch (idx) {
				case 1:
					add(left, bottom);
					break;
				case 2:
					add(bottom, right);
					break;
				case 3:
					add(left, right);
					break;
				case 4:
					add(top, right);
					break;
				case 5:
					add(left, top);
					add(bottom, right);
					break;
				case 6:
					add(top, bottom);
					break;
				case 7:
					add(left, top);
					break;
				case 8:
					add(top, left);
					break;
				case 9:
					add(top, bottom);
					break;
				case 10:
					add(top, right);
					add(left, bottom);
					break;
				case 11:
					add(top, right);
					break;
				case 12:
					add(right, left);
					break;
				case 13:
					add(bottom, right);
					break;
				case 14:
					add(left, bottom);
					break;
			}
		}
	}
	return segs;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = () => resolve(null);
		img.src = src;
	});
}

const GRID_SAMPLE_STEP = 4; // downsample the 256x256 tile to a 64x64 elevation grid for performance
const CONTOUR_ZOOM = 12; // fixed fetch zoom regardless of current map zoom — keeps tile size/detail predictable

/**
 * Fetches one terrain tile covering the map's current center, decodes
 * elevation, and generates contour lines via marching squares.
 *
 * Known scope limitation: this covers a single tile around the map
 * center, not the full current viewport — at low zooms (zoomed-out
 * poster compositions) contours will only appear near the center rather
 * than edge-to-edge. Multi-tile stitching would be the natural follow-up
 * if full-viewport coverage matters for your use case.
 */
async function generateContourGeoJSON(centerLng: number, centerLat: number): Promise<FeatureCollection<LineString> | null> {
	const { x, y } = lngLatToTileXY(centerLng, centerLat, CONTOUR_ZOOM);
	const img = await loadImage(TERRAIN_TILE_URL(CONTOUR_ZOOM, x, y));
	if (!img) return null;

	const canvas = document.createElement('canvas');
	canvas.width = img.width;
	canvas.height = img.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.drawImage(img, 0, 0);

	let pixels: ImageData;
	try {
		pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
	} catch {
		return null; // tainted canvas (CORS) — nothing we can do client-side without a backend
	}

	const gridW = Math.floor(canvas.width / GRID_SAMPLE_STEP);
	const gridH = Math.floor(canvas.height / GRID_SAMPLE_STEP);
	const grid = new Float32Array(gridW * gridH);
	let minElev = Infinity;
	let maxElev = -Infinity;

	for (let gy = 0; gy < gridH; gy++) {
		for (let gx = 0; gx < gridW; gx++) {
			const px = gx * GRID_SAMPLE_STEP;
			const py = gy * GRID_SAMPLE_STEP;
			const i = (py * canvas.width + px) * 4;
			const elev = decodeTerrarium(pixels.data[i]!, pixels.data[i + 1]!, pixels.data[i + 2]!);
			grid[gy * gridW + gx] = elev;
			if (elev < minElev) minElev = elev;
			if (elev > maxElev) maxElev = elev;
		}
	}

	if (!isFinite(minElev) || !isFinite(maxElev) || maxElev - minElev < 1) {
		return { type: 'FeatureCollection', features: [] }; // flat/ocean tile — no meaningful contours
	}

	// pick a "nice" interval targeting roughly 6-10 contour bands
	const rawInterval = (maxElev - minElev) / 8;
	const magnitude = 10 ** Math.floor(Math.log10(rawInterval));
	const interval = Math.max(10, Math.round(rawInterval / magnitude) * magnitude);

	const [tileLng0, tileLat0] = tileXYToLngLat(x, y, CONTOUR_ZOOM);
	const [tileLng1, tileLat1] = tileXYToLngLat(x + 1, y + 1, CONTOUR_ZOOM);

	const gridToLngLat = (gx: number, gy: number): [number, number] => {
		const fx = gx / gridW;
		const fy = gy / gridH;
		return [tileLng0 + (tileLng1 - tileLng0) * fx, tileLat0 + (tileLat1 - tileLat0) * fy];
	};

	const features: Feature<LineString>[] = [];
	for (let elev = Math.ceil(minElev / interval) * interval; elev < maxElev; elev += interval) {
		const segs = marchingSquaresSegments(grid, gridW, gridH, elev);
		for (const [x1, y1, x2, y2] of segs) {
			features.push({
				type: 'Feature',
				properties: { elevation: elev },
				geometry: { type: 'LineString', coordinates: [gridToLngLat(x1, y1), gridToLngLat(x2, y2)] },
			});
		}
	}

	return { type: 'FeatureCollection', features };
}

let lastGeneratedForTileKey: string | null = null;
let generationInFlight = false;

/** Idempotent — safe to call after every style change and on toggle. Regenerates geometry only when the underlying tile (center-derived) actually changes. */
export async function ensureContours(map: maplibregl.Map, visible: boolean, theme: ArtisticTheme): Promise<void> {
	if (!map.getSource(SOURCE_ID)) {
		map.addSource(SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
	}

	if (!map.getLayer(LAYER_ID)) {
		map.addLayer({
			id: LAYER_ID,
			type: 'line',
			source: SOURCE_ID,
			layout: { visibility: visible ? 'visible' : 'none' },
			paint: {
				'line-color': theme.text || '#000000',
				'line-width': 0.6,
				'line-opacity': 0.35,
			},
		});
	} else {
		map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
		map.setPaintProperty(LAYER_ID, 'line-color', theme.text || '#000000');
	}

	if (!visible || generationInFlight) return;

	const center = map.getCenter();
	const { x, y } = lngLatToTileXY(center.lng, center.lat, CONTOUR_ZOOM);
	const tileKey = `${x}/${y}`;
	if (tileKey === lastGeneratedForTileKey) return;

	generationInFlight = true;
	try {
		const geojson = await generateContourGeoJSON(center.lng, center.lat);
		if (geojson) {
			const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
			source?.setData(geojson);
			lastGeneratedForTileKey = tileKey;
		}
	} catch (e) {
		console.error('Failed to generate contours:', e);
	} finally {
		generationInFlight = false;
	}
}
