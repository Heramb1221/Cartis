import L from 'leaflet';
import maplibregl from 'maplibre-gl';
import { state, updateState, getSelectedArtisticTheme } from '../core/store';
import { findBestInsertIndex } from '../core/utils';
import { updateRouteGeometry, syncRouteMarkers } from './routes/route-manager';
import { generateMapLibreStyle } from './maplibre/artistic-style';
import { applyMapLibreOverlays } from './maplibre/overlays';
import { withCartoTileKey } from '../core/carto-key';
import type { ArtisticTheme } from '../types/themes';

let map: L.Map | null = null;
let tileLayer: L.TileLayer | null = null;
let artisticMap: maplibregl.Map | null = null;
let currentArtisticThemeName: string | null = null;
let isSyncing = false;
let styleChangeInProgress = false;
let pendingArtisticStyle: maplibregl.StyleSpecification | null = null;
let pendingArtisticThemeName: string | null = null;

export const getMap = (): L.Map | null => map;
export const getArtisticMap = (): maplibregl.Map | null => artisticMap;

export function initMap(containerId: string, initialCenter: [number, number], initialZoom: number, initialTileUrl: string): L.Map {
	map = L.map(containerId, {
		zoomControl: false,
		attributionControl: false,
		scrollWheelZoom: 'center',
		touchZoom: 'center',
	}).setView(initialCenter, initialZoom);

	tileLayer = L.tileLayer(withCartoTileKey(initialTileUrl), {
		maxZoom: 19,
		crossOrigin: true,
	}).addTo(map);

	map.on('moveend', () => {
		if (isSyncing) return;
		isSyncing = true;

		const center = map!.getCenter();
		const zoom = map!.getZoom();
		updateState({
			lat: center.lat,
			lon: center.lng,
			zoom: zoom,
		});

		if (artisticMap) {
			artisticMap.jumpTo({
				center: [center.lng, center.lat],
				zoom: zoom - 1,
			});
		}

		isSyncing = false;
	});

	try {
		initArtisticMap('artistic-map', [initialCenter[1], initialCenter[0]], initialZoom - 1);
	} catch (err) {
		console.error('Failed to initialize artistic map (MapLibre GL):', err);
	}

	if (state.showRoute) {
		updateRouteGeometry();
	}

	return map;
}

function initArtisticMap(containerId: string, center: [number, number], zoom: number): void {
	artisticMap = new maplibregl.Map({
		container: containerId,
		style: { version: 8, sources: {}, layers: [] },
		center: center,
		zoom: zoom,
		interactive: true,
		attributionControl: false,
		// maplibre-gl v5 moved antialias/preserveDrawingBuffer off the top-level
		// MapOptions and into canvasContextAttributes. preserveDrawingBuffer is
		// still required here for the same reason noted in the Phase 0 plan:
		// export needs to read valid pixels from getCanvas() after render.
		canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true },
	});

	artisticMap.scrollZoom.setWheelZoomRate(1);
	artisticMap.scrollZoom.setZoomRate(1 / 600);

	artisticMap.on('style.load', () => {
		if (pendingArtisticStyle) {
			const next = pendingArtisticStyle;
			const nextName = pendingArtisticThemeName;
			pendingArtisticStyle = null;
			pendingArtisticThemeName = null;
			currentArtisticThemeName = nextName;
			artisticMap!.setStyle(next);
		} else {
			styleChangeInProgress = false;
			applyMapLibreOverlays(artisticMap!, state, getSelectedArtisticTheme());
		}
	});

	let overlayRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	artisticMap.on('moveend', () => {
		if (overlayRefreshTimer) clearTimeout(overlayRefreshTimer);
		overlayRefreshTimer = setTimeout(() => {
			if (artisticMap) applyMapLibreOverlays(artisticMap, state, getSelectedArtisticTheme());
		}, 300);
	});

	artisticMap.on('moveend', () => {
		if (isSyncing) return;
		isSyncing = true;

		const center = artisticMap!.getCenter();
		const zoom = artisticMap!.getZoom();

		updateState({
			lat: center.lat,
			lon: center.lng,
			zoom: zoom + 1,
		});

		if (map) {
			map.setView([center.lat, center.lng], zoom + 1, { animate: false });
		}

		isSyncing = false;
	});

	artisticMap.on('mousedown', 'route-line', (e) => {
		e.preventDefault();
		const startPos = e.point;
		let pointAdded = false;
		let index = -1;

		isSyncing = true;
		artisticMap!.dragPan.disable();

		const onMouseMove = (me: maplibregl.MapMouseEvent) => {
			const currentPos = me.point;
			const dist = Math.sqrt(Math.pow(currentPos.x - startPos.x, 2) + Math.pow(currentPos.y - startPos.y, 2));

			if (!pointAdded && dist > 5) {
				const via = [...(state.routeViaPoints || [])];
				const routePoints = [
					{ lat: state.routeStartLat, lon: state.routeStartLon },
					...via,
					{ lat: state.routeEndLat, lon: state.routeEndLon },
				];
				index = findBestInsertIndex(me.lngLat.lat, me.lngLat.lng, routePoints);
				via.splice(index, 0, { lat: me.lngLat.lat, lon: me.lngLat.lng });
				updateState({ routeViaPoints: via });
				pointAdded = true;
			}

			if (pointAdded && index !== -1) {
				const v = [...state.routeViaPoints];
				v[index] = { lat: me.lngLat.lat, lon: me.lngLat.lng };
				updateState({ routeViaPoints: v });
				syncRouteMarkers(false);
			}
		};

		const onMouseUp = () => {
			artisticMap!.off('mousemove', onMouseMove);
			artisticMap!.off('mouseup', onMouseUp);
			artisticMap!.dragPan.enable();
			isSyncing = false;
			if (pointAdded) {
				updateRouteGeometry();
			}
		};

		artisticMap!.on('mousemove', onMouseMove);
		artisticMap!.on('mouseup', onMouseUp);
	});

	artisticMap.on('mouseenter', 'route-line', () => {
		artisticMap!.getCanvas().style.cursor = 'crosshair';
	});

	artisticMap.on('mouseleave', 'route-line', () => {
		artisticMap!.getCanvas().style.cursor = '';
	});
}

export function updateArtisticStyle(theme: ArtisticTheme): void {
	if (!artisticMap) return;
	if (currentArtisticThemeName === theme.name) return;

	currentArtisticThemeName = theme.name;
	applyArtisticStyleInternal(theme);
}

/** Bypasses the same-theme memo guard — needed to revert live theme-preview color changes (e.g. Cancel in the custom theme editor) back to the actually-saved theme's real colors. */
export function forceRefreshArtisticStyle(theme: ArtisticTheme): void {
	if (!artisticMap) return;
	applyArtisticStyleInternal(theme);
}

function applyArtisticStyleInternal(theme: ArtisticTheme): void {
	if (!artisticMap) return;
	const style = generateMapLibreStyle(theme);

	if (styleChangeInProgress) {
		pendingArtisticStyle = style;
		pendingArtisticThemeName = theme.name;
		try {
			artisticMap.setStyle(style);
		} catch {
			/* style change already in flight, this attempt is picked up by the pending* vars above */
		}
		return;
	}

	styleChangeInProgress = true;
	try {
		artisticMap.setStyle(style);
	} catch {
		pendingArtisticStyle = style;
		pendingArtisticThemeName = theme.name;
	}
}

export function refreshMapLibreOverlays(): void {
	if (artisticMap) applyMapLibreOverlays(artisticMap, state, getSelectedArtisticTheme());
}

export function updateMapPosition(lat?: number, lon?: number, zoom?: number, options: L.ZoomPanOptions = { animate: true }): void {
	if (map) {
		if (lat !== undefined && lon !== undefined) {
			map.setView([lat, lon], zoom ?? map.getZoom(), options);
		} else if (zoom !== undefined) {
			map.setZoom(zoom, options);
		}
	}
}

export function updateMapTheme(tileUrl: string): void {
	if (tileLayer) {
		tileLayer.setUrl(withCartoTileKey(tileUrl));
	}
}

export function waitForTilesLoad(timeout = 30000): Promise<void> {
	return new Promise((resolve) => {
		if (!map || !tileLayer) return resolve();
		try {
			const internalTiles = (tileLayer as unknown as { _tiles?: Record<string, { el?: HTMLImageElement; tile?: HTMLImageElement; _el?: HTMLImageElement }> })._tiles;
			if (internalTiles) {
				const tiles = Object.values(internalTiles);
				const anyLoading = tiles.some((t) => {
					const el = t.el || t.tile || t._el;
					return el && el.complete === false;
				});
				if (!anyLoading) return resolve();
			}
		} catch {
			/* internal Leaflet tile cache shape can vary by version — fall through to the load event below */
		}

		let resolved = false;
		const onLoad = () => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timer);
				resolve();
			}
		};
		tileLayer.once('load', onLoad);
		const timer = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				resolve();
			}
		}, timeout);
	});
}

export function waitForArtisticIdle(timeout = 30000): Promise<void> {
	return new Promise((resolve) => {
		if (!artisticMap) return resolve();
		let resolved = false;
		const onIdle = () => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timer);
				resolve();
			}
		};
		try {
			artisticMap.once('idle', onIdle);
		} catch {
			resolve();
			return;
		}
		const timer = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				resolve();
			}
		}, timeout);
	});
}

export function getMapInstance(): L.Map | null {
	return map;
}
export function getArtisticMapInstance(): maplibregl.Map | null {
	return artisticMap;
}

export function updateMapTilt(pitch?: number, bearing?: number): void {
	if (!artisticMap) return;
	if (pitch !== undefined && isFinite(pitch)) artisticMap.setPitch(pitch);
	if (bearing !== undefined && isFinite(bearing)) artisticMap.setBearing(bearing);
}

export function invalidateMapSize(): void {
	if (map) map.invalidateSize({ animate: false });
	if (artisticMap) artisticMap.resize();
}

export { updateRouteStyles, syncRouteMarkers, updateRouteGeometry } from './routes/route-manager';
export { updateMarkerStyles, updateMarkerIcon, updateMarkerSize, updateMarkerVisibility, updateMarkerPosition } from './markers/marker-manager';
