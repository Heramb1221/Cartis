import L from 'leaflet';
import maplibregl from 'maplibre-gl';
import { state, updateState, getSelectedTheme, getSelectedArtisticTheme } from '../../core/store';
import { markerIcons } from './marker-icons';
import { getMap, getArtisticMap } from '../map-init';
import type { CartisState, MarkerIcon } from '../../types/state';

let markers: L.Marker[] = [];
let artisticMarkers: maplibregl.Marker[] = [];

export function getMarkers(): L.Marker[] {
	return markers;
}
export function getArtisticMarkers(): maplibregl.Marker[] {
	return artisticMarkers;
}

export function clearMarkers(): void {
	markers.forEach((m) => m.remove());
	artisticMarkers.forEach((m) => m.remove());
	markers = [];
	artisticMarkers = [];
}

export function updateMarkerStyles(currentState: CartisState): void {
	const map = getMap();
	const artisticMap = getArtisticMap();
	if (!map) return;

	markers.forEach((m) => m.remove());
	artisticMarkers.forEach((m) => m.remove());
	markers = [];
	artisticMarkers = [];

	if (!currentState.showMarker) return;

	const iconType: MarkerIcon = currentState.markerIcon || 'pin';
	const baseSize = 40;
	const size = Math.round(baseSize * (currentState.markerSize || 1));

	const isArtistic = currentState.renderMode === 'artistic';
	const theme = isArtistic ? getSelectedArtisticTheme() : getSelectedTheme();
	const color = theme.route || (isArtistic ? ('text' in theme && theme.text) || '#0f172a' : ('textColor' in theme && theme.textColor) || '#0f172a');

	const html = (markerIcons[iconType] || markerIcons.pin).replace('class="marker-pin"', `style="width: ${size}px; height: ${size}px; color: ${color};"`);

	const anchorX = size / 2;
	const anchorY = iconType === 'pin' ? size : size / 2;

	(currentState.markers || []).forEach((markerData, index) => {
		const icon = L.divIcon({
			className: 'custom-marker',
			html: html,
			iconSize: [size, size],
			iconAnchor: [anchorX, anchorY],
		});

		const lMarker = L.marker([markerData.lat, markerData.lon], {
			icon: icon,
			draggable: true,
		}).addTo(map);

		lMarker.on('dragend', () => {
			const pos = lMarker.getLatLng();
			const newMarkers = [...currentState.markers];
			newMarkers[index] = { lat: pos.lat, lon: pos.lng };
			updateState({ markers: newMarkers });
		});

		lMarker.on('dblclick', (e) => {
			L.DomEvent.stopPropagation(e);
			const newMarkers = currentState.markers.filter((_, i) => i !== index);
			updateState({ markers: newMarkers });
		});

		markers.push(lMarker);

		if (artisticMap) {
			const el = document.createElement('div');
			el.className = 'custom-marker';
			el.innerHTML = html;
			el.style.width = `${size}px`;
			el.style.height = `${size}px`;

			el.addEventListener('dblclick', (e) => {
				e.stopPropagation();
				const newMarkers = currentState.markers.filter((_, i) => i !== index);
				updateState({ markers: newMarkers });
			});

			const aMarker = new maplibregl.Marker({
				element: el,
				draggable: true,
				anchor: iconType === 'pin' ? 'bottom' : 'center',
			})
				.setLngLat([markerData.lon, markerData.lat])
				.addTo(artisticMap);

			aMarker.on('dragend', () => {
				const pos = aMarker.getLngLat();
				const newMarkers = [...currentState.markers];
				newMarkers[index] = { lat: pos.lat, lon: pos.lng };
				updateState({ markers: newMarkers });
			});

			artisticMarkers.push(aMarker);
		}
	});
}

export function updateMarkerIcon(): void {
	updateMarkerStyles(state);
}

export function updateMarkerSize(): void {
	updateMarkerStyles(state);
}

export function updateMarkerVisibility(): void {
	updateMarkerStyles(state);
}

export function updateMarkerPosition(lat: number, lon: number): void {
	const newMarkers = [...state.markers];
	if (newMarkers.length > 0) {
		newMarkers[0] = { lat, lon };
		updateState({ markers: newMarkers });
	} else {
		updateState({ markers: [{ lat, lon }] });
	}
}
