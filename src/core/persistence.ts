const STORAGE_KEY = 'cartis:settings';

/**
 * Loads whichever of `keys` are present in localStorage and returns them
 * as a partial object to merge over defaultState. Ported from state.js's
 * loadSettings(), generalized so it takes an explicit key list instead of
 * a hardcoded array, and typed against T so callers get autocomplete.
 */
export function loadPersistedState<T extends object>(keys: readonly (keyof T)[]): Partial<T> {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		if (typeof parsed !== 'object' || parsed === null) return {};

		const toApply: Partial<T> = {};
		for (const key of keys) {
			if (Object.prototype.hasOwnProperty.call(parsed, key)) {
				(toApply as Record<string, unknown>)[key as string] = parsed[key as string];
			}
		}
		return toApply;
	} catch {
		return {};
	}
}

/** Ported from state.js's saveSettings(). */
export function persistState<T extends object>(state: T, keys: readonly (keyof T)[]): void {
	try {
		const out: Partial<T> = {};
		for (const key of keys) {
			out[key] = state[key];
		}
		localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
	} catch {
		// localStorage unavailable (private browsing, quota) — fail silently, matches original behavior
	}
}
