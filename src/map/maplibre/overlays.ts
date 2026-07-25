import type maplibregl from 'maplibre-gl';
import { ensureGraticule } from './graticule';
import { ensure3DBuildings } from './buildings-3d';
import { ensureContours } from './contours';
import { applyWaterLandInversion } from './inversion';
import { ensureTransit } from './transit';
import { ensureHeatmap } from './heatmap';
import { ensureCustomTrackLayer } from './custom-track-layer';
import type { CartisState } from '../../types/state';
import type { ArtisticTheme } from '../../types/themes';

/**
 * Re-applies every MapLibre-only overlay to the given map based on current
 * state. Idempotent by design (each ensure* function checks for its own
 * source/layer before adding) — safe to call after every style.load,
 * since setStyle() wipes any layers not present in the new style spec.
 */
export function applyMapLibreOverlays(map: maplibregl.Map, state: CartisState, theme: ArtisticTheme): void {
	ensureGraticule(map, !!state.showGraticule, theme);
	ensure3DBuildings(map, !!state.show3dBuildings, theme);
	void ensureContours(map, !!state.showContours, theme);
	applyWaterLandInversion(map, theme, !!state.invertWaterLand);
	void ensureTransit(map, !!state.transitEnabled, theme);
	ensureHeatmap(map, !!state.heatmapEnabled, state.heatmapPoints || [], theme.route || '#f43f5e');
	ensureCustomTrackLayer(map, state);
}
