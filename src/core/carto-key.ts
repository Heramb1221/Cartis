const CARTO_HOST = 'basemaps.cartocdn.com';

export function cartoApiKey(): string {
	const key = import.meta.env.VITE_CARTO_API_KEY;
	return typeof key === 'string' ? key.trim() : '';
}

/** Appends `key` to CARTO raster tile URLs when VITE_CARTO_API_KEY is set. Other tile hosts are unchanged. */
export function withCartoTileKey(tileUrl: string): string {
	if (!tileUrl.includes(CARTO_HOST)) return tileUrl;
	const key = cartoApiKey();
	if (!key) return tileUrl;
	if (/(?:^|[?&])key=/.test(tileUrl)) return tileUrl;
	const sep = tileUrl.includes('?') ? '&' : '?';
	return `${tileUrl}${sep}key=${encodeURIComponent(key)}`;
}
