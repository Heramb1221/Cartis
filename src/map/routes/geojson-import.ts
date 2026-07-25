import type { Feature, FeatureCollection, Geometry, LineString, MultiLineString } from 'geojson';

function coordsFromGeometry(geom: Geometry): [number, number][] | null {
	if (geom.type === 'LineString') {
		return (geom as LineString).coordinates.map((c) => [c[0]!, c[1]!]);
	}
	if (geom.type === 'MultiLineString') {
		// flatten all lines end-to-end — good enough for a decorative track overlay
		const multi = geom as MultiLineString;
		return multi.coordinates.flatMap((line) => line.map((c): [number, number] => [c[0]!, c[1]!]));
	}
	return null;
}

/** Parses a GeoJSON file, returning the first LineString/MultiLineString found as [lon, lat] pairs. */
export function parseGeoJSONTrack(jsonText: string): [number, number][] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText);
	} catch {
		throw new Error('Could not parse file — invalid JSON.');
	}

	const obj = parsed as { type?: string };

	if (obj.type === 'FeatureCollection') {
		const fc = parsed as FeatureCollection;
		for (const feature of fc.features) {
			const coords = coordsFromGeometry((feature as Feature).geometry);
			if (coords && coords.length > 0) return coords;
		}
	} else if (obj.type === 'Feature') {
		const coords = coordsFromGeometry((parsed as Feature).geometry);
		if (coords && coords.length > 0) return coords;
	} else if (obj.type === 'LineString' || obj.type === 'MultiLineString') {
		const coords = coordsFromGeometry(parsed as Geometry);
		if (coords && coords.length > 0) return coords;
	}

	throw new Error('No LineString or MultiLineString geometry found in this GeoJSON file.');
}
