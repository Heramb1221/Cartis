import type maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { ArtisticTheme } from '../../types/themes';

const SOURCE_ID = 'transit-source';
const GLOW_LAYER_ID = 'transit-glow';
const MAIN_LAYER_ID = 'transit-main';

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const RAILWAY_TYPES = '^(subway|light_rail|tram|rail|monorail|funicular)$';

interface OverpassNode {
	type: 'node';
	id: number;
	lat: number;
	lon: number;
}
interface OverpassWay {
	type: 'way';
	id: number;
	nodes: number[];
}
type OverpassElement = OverpassNode | OverpassWay | { type: string };

function buildQuery(south: number, west: number, north: number, east: number): string {
	const bbox = `${south},${west},${north},${east}`;
	return `[out:json][timeout:25];(way["railway"~"${RAILWAY_TYPES}"](${bbox}););out body;>;out skel qt;`;
}

async function fetchTransitGeoJSON(south: number, west: number, north: number, east: number): Promise<FeatureCollection<LineString>> {
	const response = await fetch(OVERPASS_ENDPOINT, {
		method: 'POST',
		body: 'data=' + encodeURIComponent(buildQuery(south, west, north, east)),
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
	});
	if (!response.ok) throw new Error(`Overpass request failed: ${response.status}`);

	const data: { elements: OverpassElement[] } = await response.json();

	const nodeCoords = new Map<number, [number, number]>();
	for (const el of data.elements) {
		if (el.type === 'node') {
			const n = el as OverpassNode;
			nodeCoords.set(n.id, [n.lon, n.lat]);
		}
	}

	const features: Feature<LineString>[] = [];
	for (const el of data.elements) {
		if (el.type === 'way') {
			const w = el as OverpassWay;
			const coords = w.nodes.map((id) => nodeCoords.get(id)).filter((c): c is [number, number] => !!c);
			if (coords.length > 1) {
				features.push({ type: 'Feature', properties: { id: w.id }, geometry: { type: 'LineString', coordinates: coords } });
			}
		}
	}

	return { type: 'FeatureCollection', features };
}

function bboxKey(bounds: maplibregl.LngLatBounds): string {
	// rounded to ~3 decimal places (~100m) so small pans/zooms don't trigger a refetch
	const round = (n: number) => Math.round(n * 1000) / 1000;
	return [round(bounds.getSouth()), round(bounds.getWest()), round(bounds.getNorth()), round(bounds.getEast())].join(',');
}

let lastFetchedBboxKey: string | null = null;
let fetchInFlight = false;

/** Idempotent — safe to call after every style change, on toggle, and on debounced moveend. Only refetches Overpass when the viewport has meaningfully changed. */
export async function ensureTransit(map: maplibregl.Map, visible: boolean, theme: ArtisticTheme): Promise<void> {
	if (!map.getSource(SOURCE_ID)) {
		map.addSource(SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
	}

	if (!map.getLayer(GLOW_LAYER_ID)) {
		map.addLayer({
			id: GLOW_LAYER_ID,
			type: 'line',
			source: SOURCE_ID,
			layout: { 'line-cap': 'round', 'line-join': 'round', visibility: visible ? 'visible' : 'none' },
			paint: { 'line-color': theme.route || '#f43f5e', 'line-width': 5, 'line-blur': 4, 'line-opacity': 0.55 },
		});
	} else {
		map.setLayoutProperty(GLOW_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
		map.setPaintProperty(GLOW_LAYER_ID, 'line-color', theme.route || '#f43f5e');
	}

	if (!map.getLayer(MAIN_LAYER_ID)) {
		map.addLayer({
			id: MAIN_LAYER_ID,
			type: 'line',
			source: SOURCE_ID,
			layout: { 'line-cap': 'round', 'line-join': 'round', visibility: visible ? 'visible' : 'none' },
			paint: { 'line-color': theme.route || '#f43f5e', 'line-width': 1.5 },
		});
	} else {
		map.setLayoutProperty(MAIN_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
		map.setPaintProperty(MAIN_LAYER_ID, 'line-color', theme.route || '#f43f5e');
	}

	if (!visible || fetchInFlight) return;

	const bounds = map.getBounds();
	const key = bboxKey(bounds);
	if (key === lastFetchedBboxKey) return;

	fetchInFlight = true;
	try {
		const geojson = await fetchTransitGeoJSON(bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast());
		const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
		source?.setData(geojson);
		lastFetchedBboxKey = key;
	} catch (e) {
		console.error('Failed to fetch transit data:', e);
	} finally {
		fetchInFlight = false;
	}
}
