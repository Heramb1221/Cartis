import L from 'leaflet';
import maplibregl from 'maplibre-gl';
import { state, updateState } from '../../core/store';
import { getMap, getArtisticMap } from '../map-init';

let leafletPhotoMarkers: L.Marker[] = [];
let artisticPhotoMarkers: maplibregl.Marker[] = [];

export function addPhotoPin(lat: number, lon: number, dataUrl: string, caption = ''): void {
	const currentPins = state.photoPins || [];
	const newPin = {
		id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
		lat,
		lon,
		dataUrl,
		caption,
	};
	updateState({ photoPins: [...currentPins, newPin] });
	updatePhotoPinMarkers();
}

export function removePhotoPin(id: string): void {
	const currentPins = (state.photoPins || []).filter((p) => p.id !== id);
	updateState({ photoPins: currentPins });
	updatePhotoPinMarkers();
}

export function updatePhotoPinMarkers(): void {
	const map = getMap();
	const artisticMap = getArtisticMap();
	const pins = state.photoPins || [];

	leafletPhotoMarkers.forEach((m) => m.remove());
	leafletPhotoMarkers = [];

	artisticPhotoMarkers.forEach((m) => m.remove());
	artisticPhotoMarkers = [];

	pins.forEach((pin) => {
		const html = `
			<div class="group relative flex flex-col items-center cursor-pointer scale-100 hover:scale-110 transition-transform">
				<div class="w-10 h-10 bg-white p-1 rounded-2xl shadow-xl ring-2 ring-slate-900/10 overflow-hidden flex items-center justify-center">
					<img src="${pin.dataUrl}" alt="${pin.caption || 'Memory'}" class="w-full h-full object-cover rounded-xl" />
				</div>
				<div class="w-2 h-2 bg-slate-900 rotate-45 -mt-1 shadow-sm"></div>
				${
					pin.caption
						? `<span class="opacity-0 group-hover:opacity-100 absolute -bottom-6 bg-slate-900 text-white text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap transition-opacity shadow-md pointer-events-none">${pin.caption}</span>`
						: ''
				}
			</div>
		`;

		if (map) {
			const marker = L.marker([pin.lat, pin.lon], {
				icon: L.divIcon({
					className: 'photo-memory-pin',
					html,
					iconSize: [40, 48],
					iconAnchor: [20, 48],
				}),
			}).addTo(map);

			marker.on('click', () => {
				if (confirm(`Remove photo pin "${pin.caption || 'Memory'}"?`)) {
					removePhotoPin(pin.id);
				}
			});

			leafletPhotoMarkers.push(marker);
		}

		if (artisticMap) {
			const el = document.createElement('div');
			el.className = 'photo-memory-pin';
			el.innerHTML = html;
			el.addEventListener('click', () => {
				if (confirm(`Remove photo pin "${pin.caption || 'Memory'}"?`)) {
					removePhotoPin(pin.id);
				}
			});

			const artisticMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
				.setLngLat([pin.lon, pin.lat])
				.addTo(artisticMap);

			artisticPhotoMarkers.push(artisticMarker);
		}
	});
}
