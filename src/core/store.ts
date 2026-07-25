import { defaultState, SAVED_KEYS } from '../types/state';
import type { CartisState } from '../types/state';
import { loadPersistedState, persistState } from './persistence';
import { themes } from './themes/raster-themes';
import { artisticThemes } from './themes/artistic-themes';
import { loadCustomThemes } from './themes/custom-themes';
import type { RasterTheme, ArtisticTheme } from '../types/themes';

type Observer = (state: CartisState) => void;

/**
 * Mutable, module-scoped state object + observer list. This mirrors the
 * original core/state.js exactly: no framework, no proxies, just a plain
 * object mutated via updateState() and an observer array notified after
 * every change. Kept intentionally simple for Phase 1 parity; a
 * finer-grained (per-key) subscription model can be layered on later
 * without changing this file's public API.
 */
export const state: CartisState = { ...defaultState, ...loadPersistedState(SAVED_KEYS) };

const observers: Observer[] = [];

export function updateState(partial: Partial<CartisState>): void {
	Object.assign(state, partial);
	persistState(state, SAVED_KEYS);
	notifyObservers();
}

export function subscribe(callback: Observer): void {
	observers.push(callback);
	callback(state);
}

function notifyObservers(): void {
	for (const callback of observers) callback(state);
}

export function getSelectedTheme(): RasterTheme {
	return themes[state.theme] ?? themes.minimal!;
}

export function getSelectedArtisticTheme(currentState: CartisState = state): ArtisticTheme {
	if (currentState.artisticTheme?.startsWith('custom_')) {
		const custom = loadCustomThemes();
		const found = custom[currentState.artisticTheme];
		if (found) return found;
	}
	return artisticThemes[currentState.artisticTheme] ?? artisticThemes.cyber_noir!;
}
