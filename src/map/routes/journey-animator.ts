import L from 'leaflet';
import maplibregl from 'maplibre-gl';
import { state } from '../../core/store';
import { getMap, getArtisticMap } from '../map-init';

let animFrameId: number | null = null;
let animLeafletMarker: L.Marker | null = null;
let animArtisticMarker: maplibregl.Marker | null = null;
let isPlaying = false;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

export function isAnimationPlaying(): boolean {
	return isPlaying;
}

export function getVehicleIconHtml(mode = 'driving'): string {
	if (mode === 'flight') {
		return `<div class="w-9 h-9 bg-accent text-white rounded-full shadow-2xl flex items-center justify-center ring-4 ring-white animate-bounce"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg></div>`;
	}
	if (mode === 'train') {
		return `<div class="w-9 h-9 bg-slate-900 text-white rounded-full shadow-2xl flex items-center justify-center ring-4 ring-white animate-pulse"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2c-4.42 0-8 .5-8 4v10.5C4 18.43 5.57 20 7.5 20l-1.5 1.5v.5h12v-.5L16.5 20c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zm0 2c3.71 0 5.13.4 5.8 1H6.2c.67-.6 2.09-1 5.8-1zm-6 7V7h12v4H6zm2 5.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm8 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg></div>`;
	}
	return `<div class="w-9 h-9 bg-red-600 text-white rounded-full shadow-2xl flex items-center justify-center ring-4 ring-white animate-pulse"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg></div>`;
}

export function startJourneyAnimation(durationMs = 8000, onComplete?: () => void): void {
	stopJourneyAnimation();

	const geometry = state.routeGeometry;
	if (!geometry || geometry.length < 2) return;

	const map = getMap();
	const artisticMap = getArtisticMap();
	const mode = state.travelMode || 'driving';
	const iconHtml = getVehicleIconHtml(mode);

	if (map) {
		const startCoord: [number, number] = [geometry[0]![1], geometry[0]![0]];
		animLeafletMarker = L.marker(startCoord, {
			icon: L.divIcon({
				className: 'animated-vehicle-marker',
				html: iconHtml,
				iconSize: [36, 36],
				iconAnchor: [18, 18],
			}),
			zIndexOffset: 2000,
		}).addTo(map);
	}

	if (artisticMap) {
		const el = document.createElement('div');
		el.className = 'animated-vehicle-marker';
		el.innerHTML = iconHtml;
		animArtisticMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
			.setLngLat([geometry[0]![0], geometry[0]![1]])
			.addTo(artisticMap);
	}

	isPlaying = true;
	const startTime = performance.now();

	const step = (now: number) => {
		if (!isPlaying) return;

		const elapsed = now - startTime;
		const progress = Math.min(1, elapsed / durationMs);

		const totalSegments = geometry.length - 1;
		const exactIndex = progress * totalSegments;
		const idx1 = Math.floor(exactIndex);
		const idx2 = Math.min(totalSegments, idx1 + 1);
		const segProgress = exactIndex - idx1;

		const p1 = geometry[idx1] || geometry[0]!;
		const p2 = geometry[idx2] || p1;

		const lon = p1[0] + (p2[0] - p1[0]) * segProgress;
		const lat = p1[1] + (p2[1] - p1[1]) * segProgress;

		if (animLeafletMarker) animLeafletMarker.setLatLng([lat, lon]);
		if (animArtisticMarker) animArtisticMarker.setLngLat([lon, lat]);

		if (progress < 1) {
			animFrameId = requestAnimationFrame(step);
		} else {
			isPlaying = false;
			if (onComplete) onComplete();
		}
	};

	animFrameId = requestAnimationFrame(step);
}

export function stopJourneyAnimation(): void {
	isPlaying = false;
	if (animFrameId !== null) {
		cancelAnimationFrame(animFrameId);
		animFrameId = null;
	}
	if (animLeafletMarker) {
		animLeafletMarker.remove();
		animLeafletMarker = null;
	}
	if (animArtisticMarker) {
		animArtisticMarker.remove();
		animArtisticMarker = null;
	}
}

export function recordJourneyVideo(durationMs = 8000): Promise<Blob | null> {
	return new Promise((resolve) => {
		const posterContainer = document.getElementById('poster-container');
		const canvasEl = posterContainer ? posterContainer.querySelector('canvas') : null;

		if (!canvasEl) {
			startJourneyAnimation(durationMs);
			setTimeout(() => {
				stopJourneyAnimation();
				resolve(null);
			}, durationMs + 200);
			return;
		}

		try {
			const stream = (canvasEl as any).captureStream(30);
			recordedChunks = [];
			mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });

			mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) recordedChunks.push(e.data);
			};

			mediaRecorder.onstop = () => {
				const blob = new Blob(recordedChunks, { type: 'video/webm' });
				resolve(blob);
			};

			mediaRecorder.start();
			startJourneyAnimation(durationMs, () => {
				if (mediaRecorder && mediaRecorder.state !== 'inactive') {
					mediaRecorder.stop();
				}
			});
		} catch (err) {
			console.warn('Canvas video capture fallback:', err);
			startJourneyAnimation(durationMs, () => resolve(null));
		}
	});
}
