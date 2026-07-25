import L from 'leaflet';
import { getMap, getArtisticMap } from '../map-init';
import { ensureCustomTrackLayer } from '../maplibre/custom-track-layer';
import type { CartisState } from '../../types/state';

let leafletGlowLine: L.Polyline | null = null;
let leafletMainLine: L.Polyline | null = null;

/** Updates both renderers' custom track visuals. Safe to call on every relevant state change and after every MapLibre style reload — idempotent on both sides. */
export function updateCustomTrackStyles(state: CartisState): void {
	const map = getMap();
	const artisticMap = getArtisticMap();

	const points = state.customTrackPoints || [];
	const visible = !!state.showCustomTrack && points.length > 1;
	const color = state.customTrackColor || '#ef4444';
	const width = state.customTrackWidth || 4;
	const glow = !!state.customTrackGlow;
	const latLngs: L.LatLngExpression[] = points.map((p) => [p[1]!, p[0]!]);

	if (map) {
		if (!visible) {
			if (leafletGlowLine) {
				leafletGlowLine.remove();
				leafletGlowLine = null;
			}
			if (leafletMainLine) {
				leafletMainLine.remove();
				leafletMainLine = null;
			}
		} else {
			if (glow) {
				if (!leafletGlowLine) {
					leafletGlowLine = L.polyline(latLngs, { color, weight: width * 2.5, opacity: 0.35, lineCap: 'round' }).addTo(map);
				} else {
					leafletGlowLine.setLatLngs(latLngs).setStyle({ color, weight: width * 2.5, opacity: 0.35 }).addTo(map);
				}
			} else if (leafletGlowLine) {
				leafletGlowLine.remove();
				leafletGlowLine = null;
			}

			if (!leafletMainLine) {
				leafletMainLine = L.polyline(latLngs, { color, weight: width, opacity: 1, lineCap: 'round' }).addTo(map);
			} else {
				leafletMainLine.setLatLngs(latLngs).setStyle({ color, weight: width, opacity: 1 }).addTo(map);
			}
		}
	}

	if (artisticMap) {
		try {
			ensureCustomTrackLayer(artisticMap, state);
		} catch {
			/* style may be mid-transition — the next style.load reapplication picks this up */
		}
	}
}
