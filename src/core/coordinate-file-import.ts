import type { MarkerPoint } from '../types/state';

function parseCSV(text: string): MarkerPoint[] {
	const lines = text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	if (lines.length === 0) return [];

	const firstCells = lines[0]!.split(',').map((c) => c.trim());
	const looksLikeHeader = firstCells.some((c) => isNaN(parseFloat(c)));

	let latIdx = 0;
	let lonIdx = 1;
	let dataLines = lines;

	if (looksLikeHeader) {
		const headerLower = firstCells.map((c) => c.toLowerCase().replace(/["']/g, ''));
		const foundLat = headerLower.findIndex((c) => c === 'lat' || c === 'latitude' || c === 'y');
		const foundLon = headerLower.findIndex((c) => c === 'lon' || c === 'lng' || c === 'longitude' || c === 'x');
		if (foundLat !== -1) latIdx = foundLat;
		if (foundLon !== -1) lonIdx = foundLon;
		dataLines = lines.slice(1);
	}

	const points: MarkerPoint[] = [];
	for (const line of dataLines) {
		const cells = line.split(',').map((c) => c.trim().replace(/["']/g, ''));
		const lat = parseFloat(cells[latIdx] ?? '');
		const lon = parseFloat(cells[lonIdx] ?? '');
		if (isFinite(lat) && isFinite(lon)) points.push({ lat, lon });
	}
	return points;
}

function parseJSONPoints(text: string): MarkerPoint[] {
	const parsed: unknown = JSON.parse(text);
	if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of coordinates.');

	const points: MarkerPoint[] = [];
	for (const item of parsed) {
		if (Array.isArray(item) && item.length >= 2 && typeof item[0] === 'number' && typeof item[1] === 'number') {
			points.push({ lat: item[0], lon: item[1] });
		} else if (item && typeof item === 'object') {
			const obj = item as Record<string, unknown>;
			const lat = obj.lat ?? obj.latitude ?? obj.y;
			const lon = obj.lon ?? obj.lng ?? obj.longitude ?? obj.x;
			if (typeof lat === 'number' && typeof lon === 'number') points.push({ lat, lon });
		}
	}
	return points;
}

/** Parses either CSV (lat,lon columns, optional header) or JSON (array of {lat,lon} or [lat,lon]) coordinate files. Format is inferred from filename first, then content. */
export function parseCoordinateFile(text: string, filename: string): MarkerPoint[] {
	const isJSON = filename.toLowerCase().endsWith('.json') || text.trim().startsWith('[') || text.trim().startsWith('{');
	const points = isJSON ? parseJSONPoints(text) : parseCSV(text);
	if (points.length === 0) throw new Error('No valid coordinates found in this file.');
	return points;
}
