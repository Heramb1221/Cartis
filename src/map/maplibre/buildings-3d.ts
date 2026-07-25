import type maplibregl from 'maplibre-gl';
import type { ArtisticTheme } from '../../types/themes';

const LAYER_ID = 'buildings-3d-layer';

/**
 * Reuses the existing 'openfreemap' vector source already added by
 * artistic-style.ts — no new source needed. 'building' with
 * render_height/render_min_height is the standard OpenMapTiles schema
 * (https://openmaptiles.org/schema/#building), which is what the
 * openfreemap 'planet' tileset follows.
 */
export function ensure3DBuildings(map: maplibregl.Map, visible: boolean, theme: ArtisticTheme): void {
	if (!map.getSource('openfreemap')) return;

	if (!map.getLayer(LAYER_ID)) {
		map.addLayer({
			id: LAYER_ID,
			type: 'fill-extrusion',
			source: 'openfreemap',
			'source-layer': 'building',
			minzoom: 14,
			layout: { visibility: visible ? 'visible' : 'none' },
			paint: {
				'fill-extrusion-color': theme.road_default || '#cccccc',
				'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
				'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
				'fill-extrusion-opacity': 0.85,
			},
		});
	} else {
		map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
		map.setPaintProperty(LAYER_ID, 'fill-extrusion-color', theme.road_default || '#cccccc');
	}
}
