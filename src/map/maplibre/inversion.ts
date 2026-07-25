import type maplibregl from 'maplibre-gl';
import type { ArtisticTheme } from '../../types/themes';

/**
 * generateMapLibreStyle's 'background' layer paints the land color and the
 * 'water' layer paints the water color — inversion just swaps which theme
 * color goes to which layer. Called after every style.load (theme colors
 * are baked into a fresh style each time, so this has to reapply, not just
 * toggle something once).
 */
export function applyWaterLandInversion(map: maplibregl.Map, theme: ArtisticTheme, inverted: boolean): void {
	if (!map.getLayer('background') || !map.getLayer('water')) return;

	const landColor = theme.bg || '#ffffff';
	const waterColor = theme.water || '#a0c8f0';

	if (inverted) {
		map.setPaintProperty('background', 'background-color', waterColor);
		map.setPaintProperty('water', 'fill-color', landColor);
	} else {
		map.setPaintProperty('background', 'background-color', landColor);
		map.setPaintProperty('water', 'fill-color', waterColor);
	}
}
