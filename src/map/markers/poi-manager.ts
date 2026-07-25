import L from 'leaflet';
import maplibregl from 'maplibre-gl';
import { getMap, getArtisticMap } from '../map-init';
import { getSelectedTheme, getSelectedArtisticTheme } from '../../core/store';
import type { CartisState } from '../../types/state';

let leafletPoiMarkers: L.Marker[] = [];
let artisticPoiMarkers: maplibregl.Marker[] = [];

function poiHtml(label: string, color: string): string {
	return `
		<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-100%);">
			<div style="background:${color};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:9999px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3);margin-bottom:2px;">${escapeHtml(label)}</div>
			<div style="width:8px;height:8px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>
		</div>
	`;
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Fully clears and redraws each call — fine at the scale POIs are expected to be added (a handful, not thousands), and keeps this in line with how marker-manager already behaves. */
export function updatePoiStyles(state: CartisState): void {
	const map = getMap();
	const artisticMap = getArtisticMap();

	leafletPoiMarkers.forEach((m) => m.remove());
	artisticPoiMarkers.forEach((m) => m.remove());
	leafletPoiMarkers = [];
	artisticPoiMarkers = [];

	const pois = state.customPois || [];
	if (pois.length === 0) return;

	const isArtistic = state.renderMode === 'artistic';
	const color = isArtistic ? getSelectedArtisticTheme().route || '#0f172a' : getSelectedTheme().route || '#0f172a';

	if (map) {
		for (const poi of pois) {
			const icon = L.divIcon({ className: 'custom-poi', html: poiHtml(poi.label, color), iconSize: [1, 1], iconAnchor: [0, 0] });
			const marker = L.marker([poi.lat, poi.lon], { icon, interactive: false }).addTo(map);
			leafletPoiMarkers.push(marker);
		}
	}

	if (artisticMap) {
		for (const poi of pois) {
			const el = document.createElement('div');
			el.innerHTML = poiHtml(poi.label, color);
			const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([poi.lon, poi.lat]).addTo(artisticMap);
			artisticPoiMarkers.push(marker);
		}
	}
}
