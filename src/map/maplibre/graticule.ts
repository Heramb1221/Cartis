import type maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { ArtisticTheme } from '../../types/themes';

const SOURCE_ID = 'graticule-source';
const LAYER_ID = 'graticule-layer';
const SPACING_DEG = 10;

function buildGraticuleGeoJSON(spacingDeg: number): FeatureCollection<LineString> {
	const features: Feature<LineString>[] = [];

	for (let lon = -180; lon <= 180; lon += spacingDeg) {
		const coords: [number, number][] = [];
		for (let lat = -85; lat <= 85; lat += 5) coords.push([lon, lat]);
		features.push({ type: 'Feature', properties: { kind: 'meridian' }, geometry: { type: 'LineString', coordinates: coords } });
	}

	for (let lat = -80; lat <= 80; lat += spacingDeg) {
		const coords: [number, number][] = [];
		for (let lon = -180; lon <= 180; lon += 5) coords.push([lon, lat]);
		features.push({ type: 'Feature', properties: { kind: 'parallel' }, geometry: { type: 'LineString', coordinates: coords } });
	}

	return { type: 'FeatureCollection', features };
}

/** Adds the graticule source/layer if missing, then syncs its visibility and color to current state/theme. Idempotent — safe to call after every style change. */
export function ensureGraticule(map: maplibregl.Map, visible: boolean, theme: ArtisticTheme): void {
	if (!map.getSource(SOURCE_ID)) {
		map.addSource(SOURCE_ID, { type: 'geojson', data: buildGraticuleGeoJSON(SPACING_DEG) });
	}

	if (!map.getLayer(LAYER_ID)) {
		map.addLayer({
			id: LAYER_ID,
			type: 'line',
			source: SOURCE_ID,
			layout: { visibility: visible ? 'visible' : 'none' },
			paint: {
				'line-color': theme.text || '#000000',
				'line-width': 0.5,
				'line-opacity': 0.25,
				'line-dasharray': [2, 2],
			},
		});
	} else {
		map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
		map.setPaintProperty(LAYER_ID, 'line-color', theme.text || '#000000');
	}
}
