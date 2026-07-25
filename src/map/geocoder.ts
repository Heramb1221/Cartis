export interface GeocodeResult {
	name: string;
	lat: number;
	lon: number;
	shortName: string;
	country: string;
}

export interface SearchLocationOptions {
	limit?: number;
	signal?: AbortSignal;
}

export async function searchLocation(query: string, opts: SearchLocationOptions = {}): Promise<GeocodeResult[]> {
	if (!query || query.length < 2) return [];

	const { limit = 15, signal } = opts;

	try {
		const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=${limit}&addressdetails=1`;
		const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
		const data = await response.json();

		return data.map((item: any) => ({
			name: item.display_name,
			lat: parseFloat(item.lat),
			lon: parseFloat(item.lon),
			shortName: item.name || (item.display_name && item.display_name.split(',')[0]) || item.display_name,
			country: item.address ? item.address.country : '',
		}));
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') {
			return [];
		}
		console.error('Geocoding error:', error);
		return [];
	}
}

export function formatCoords(lat: number, lon: number): string {
	const latDir = lat >= 0 ? 'N' : 'S';
	const lonDir = lon >= 0 ? 'E' : 'W';

	return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
}
