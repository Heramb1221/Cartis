import type maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import type { MarkerPoint } from '../../types/state';

const SOURCE_ID = 'heatmap-source';
const LAYER_ID = 'heatmap-layer';

function toGeoJSON(points: MarkerPoint[]): FeatureCollection<Point> {
	const features: Feature<Point>[] = points.map((p) => ({
		type: 'Feature',
		properties: {},
		geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
	}));
	return { type: 'FeatureCollection', features };
}

/** Idempotent — safe to call after every style.load and on every relevant state change. */
export function ensureHeatmap(map: maplibregl.Map, visible: boolean, points: MarkerPoint[], color: string): void {
	if (!map.getSource(SOURCE_ID)) {
		map.addSource(SOURCE_ID, { type: 'geojson', data: toGeoJSON(points) });
	} else {
		const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
		source.setData(toGeoJSON(points));
	}

	if (!map.getLayer(LAYER_ID)) {
		map.addLayer({
			id: LAYER_ID,
			type: 'heatmap',
			source: SOURCE_ID,
			layout: { visibility: visible ? 'visible' : 'none' },
			paint: {
				'heatmap-weight': 1,
				'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 15, 3],
				'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 8, 15, 40],
				'heatmap-opacity': 0.75,
				'heatmap-color': [
					'interpolate',
					['linear'],
					['heatmap-density'],
					0,
					'rgba(0,0,0,0)',
					0.2,
					hexToRgbaString(color, 0.3),
					0.4,
					hexToRgbaString(color, 0.55),
					0.7,
					hexToRgbaString(color, 0.8),
					1,
					hexToRgbaString(color, 1),
				],
			},
		});
	} else {
		map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
	}
}

function hexToRgbaString(hex: string, alpha: number): string {
	const h = hex.replace('#', '');
	const full = h.length === 3 ? h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]! : h;
	const r = parseInt(full.slice(0, 2), 16) || 0;
	const g = parseInt(full.slice(2, 4), 16) || 0;
	const b = parseInt(full.slice(4, 6), 16) || 0;
	return `rgba(${r},${g},${b},${alpha})`;
}
