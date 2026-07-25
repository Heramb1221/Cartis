import type { CustomTheme, CustomThemeMap } from '../../types/themes';

const STORAGE_KEY = 'cartis:custom-themes';

export function loadCustomThemes(): CustomThemeMap {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as CustomThemeMap) : {};
	} catch {
		return {};
	}
}

export function saveCustomTheme(key: string, theme: CustomTheme): void {
	const all = loadCustomThemes();
	all[key] = theme;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function deleteCustomTheme(key: string): void {
	const all = loadCustomThemes();
	delete all[key];
	localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function newCustomThemeKey(): string {
	return 'custom_' + Date.now();
}

export function exportCustomThemes(): void {
	const all = loadCustomThemes();
	const json = JSON.stringify(all, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'cartis-custom-themes.json';
	a.click();
	URL.revokeObjectURL(url);
}

export function clearCustomThemes(): void {
	localStorage.removeItem(STORAGE_KEY);
}

export function importCustomThemesFromJSON(jsonString: string): { imported: number; skipped: number } {
	const parsed: unknown = JSON.parse(jsonString);
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error('Invalid format');
	}
	const all = loadCustomThemes();
	let imported = 0;
	let skipped = 0;
	for (const [key, theme] of Object.entries(parsed as Record<string, unknown>)) {
		if (typeof theme === 'object' && theme !== null && 'name' in theme) {
			const finalKey = all[key] ? 'custom_' + Date.now() + '_' + imported : key;
			all[finalKey] = theme as CustomTheme;
			imported++;
		} else {
			skipped++;
		}
	}
	localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
	return { imported, skipped };
}
