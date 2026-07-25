import type maplibregl from 'maplibre-gl';
import type { Feature, LineString } from 'geojson';
import type { CartisState } from '../../types/state';

const SOURCE_ID = 'custom-track-source';
const GLOW_LAYER_ID = 'custom-track-glow';
const MAIN_LAYER_ID = 'custom-track-main';

function emptyLineData(): Feature<LineString> {
	return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } };
}

/** Idempotent — safe to call after every style.load and on every relevant state change. */
export function ensureCustomTrackLayer(map: maplibregl.Map, state: CartisState): void {
	const points = state.customTrackPoints || [];
	const visible = !!state.showCustomTrack && points.length > 1;
	const color = state.customTrackColor || '#ef4444';
	const width = state.customTrackWidth || 4;
	const glow = !!state.customTrackGlow;

	if (!map.getSource(SOURCE_ID)) {
		map.addSource(SOURCE_ID, { type: 'geojson', data: emptyLineData() });
	}

	if (!map.getLayer(GLOW_LAYER_ID)) {
		map.addLayer({
			id: GLOW_LAYER_ID,
			type: 'line',
			source: SOURCE_ID,
			layout: { 'line-cap': 'round', 'line-join': 'round', visibility: visible && glow ? 'visible' : 'none' },
			paint: {
				'line-color': color,
				'line-width': width * 2.5,
				'line-blur': 6,
				'line-opacity': 0.5,
			},
		});
	} else {
		map.setLayoutProperty(GLOW_LAYER_ID, 'visibility', visible && glow ? 'visible' : 'none');
		map.setPaintProperty(GLOW_LAYER_ID, 'line-color', color);
		map.setPaintProperty(GLOW_LAYER_ID, 'line-width', width * 2.5);
	}

	if (!map.getLayer(MAIN_LAYER_ID)) {
		map.addLayer({
			id: MAIN_LAYER_ID,
			type: 'line',
			source: SOURCE_ID,
			layout: { 'line-cap': 'round', 'line-join': 'round', visibility: visible ? 'visible' : 'none' },
			paint: {
				'line-color': color,
				'line-width': width,
			},
		});
	} else {
		map.setLayoutProperty(MAIN_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
		map.setPaintProperty(MAIN_LAYER_ID, 'line-color', color);
		map.setPaintProperty(MAIN_LAYER_ID, 'line-width', width);
	}

	const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
	source?.setData({
		type: 'Feature',
		properties: {},
		geometry: { type: 'LineString', coordinates: points },
	});
}
