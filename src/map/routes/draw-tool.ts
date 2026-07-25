import type L from 'leaflet';
import type maplibregl from 'maplibre-gl';
import { getMap, getArtisticMap } from '../map-init';

export interface DrawSession {
	/** Removes the point-adding click handlers. The accumulated points remain wherever the caller stored them via onPoint. */
	stop: () => void;
}

/**
 * Starts a click-to-add-point drawing session. Attaches to both renderers
 * since only one is interactive/visible at a time (the inactive one has
 * pointer-events: none applied elsewhere), so there's no risk of double
 * handling a single click.
 */
export function startDrawSession(onPoint: (lon: number, lat: number) => void): DrawSession {
	const map = getMap();
	const artisticMap = getArtisticMap();

	const leafletHandler = (e: L.LeafletMouseEvent) => {
		onPoint(e.latlng.lng, e.latlng.lat);
	};
	const maplibreHandler = (e: maplibregl.MapMouseEvent) => {
		onPoint(e.lngLat.lng, e.lngLat.lat);
	};

	map?.on('click', leafletHandler);
	artisticMap?.on('click', maplibreHandler);

	if (map) map.getContainer().style.cursor = 'crosshair';
	if (artisticMap) artisticMap.getCanvas().style.cursor = 'crosshair';

	return {
		stop: () => {
			map?.off('click', leafletHandler);
			artisticMap?.off('click', maplibreHandler);
			if (map) map.getContainer().style.cursor = '';
			if (artisticMap) artisticMap.getCanvas().style.cursor = '';
		},
	};
}
