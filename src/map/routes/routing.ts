/** Haversine distance in meters between two [lat, lon] points */
export function haversineDistance(p1: [number, number], p2: [number, number]): number {
	const R = 6371000;
	const dLat = ((p2[0] - p1[0]) * Math.PI) / 180;
	const dLon = ((p2[1] - p1[1]) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos((p1[0] * Math.PI) / 180) * Math.cos((p2[0] * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

/** Calculates total distance in km and miles from GeoJSON [lon, lat] coordinates */
export function calculateRouteStats(geometry: [number, number][]): { km: number; miles: number } {
	let totalMeters = 0;
	for (let i = 0; i < geometry.length - 1; i++) {
		const c1 = geometry[i];
		const c2 = geometry[i + 1];
		if (c1 && c2) {
			totalMeters += haversineDistance([c1[1], c1[0]], [c2[1], c2[0]]);
		}
	}
	const km = Math.round(totalMeters / 100) / 10;
	const miles = Math.round((totalMeters / 1609.344) * 10) / 10;
	return { km, miles };
}

/** Great-Circle Arc interpolation with subtle curvature for flight routes. Coordinates out: GeoJSON [lon, lat] */
export function generateFlightArc(points: [number, number][]): [number, number][] {
	if (points.length < 2) return points.map((p) => [p[1], p[0]]);

	const result: [number, number][] = [];

	for (let i = 0; i < points.length - 1; i++) {
		const p1 = points[i]; // [lat, lon]
		const p2 = points[i + 1]; // [lat, lon]
		if (!p1 || !p2) continue;

		const numSteps = 40;
		const lat1 = (p1[0] * Math.PI) / 180;
		const lon1 = (p1[1] * Math.PI) / 180;
		const lat2 = (p2[0] * Math.PI) / 180;
		const lon2 = (p2[1] * Math.PI) / 180;

		const d = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((lat1 - lat2) / 2), 2) + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon1 - lon2) / 2), 2)));

		for (let step = 0; step <= numSteps; step++) {
			const f = step / numSteps;
			if (d === 0) {
				result.push([p1[1], p1[0]]);
				continue;
			}
			const A = Math.sin((1 - f) * d) / Math.sin(d);
			const B = Math.sin(f * d) / Math.sin(d);
			const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
			const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
			const z = A * Math.sin(lat1) + B * Math.sin(lat2);
			const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
			const lon = Math.atan2(y, x);

			const degLat = (lat * 180) / Math.PI;
			const degLon = (lon * 180) / Math.PI;

			// Add slight arc curve height
			const archScale = Math.sin(f * Math.PI) * 0.05 * Math.min(30, d * (180 / Math.PI));
			const dx = p2[1] - p1[1];
			const dy = p2[0] - p1[0];
			const len = Math.sqrt(dx * dx + dy * dy) || 1;
			const perpLon = degLon - (dy / len) * archScale;
			const perpLat = degLat + (dx / len) * archScale;

			result.push([perpLon, perpLat]);
		}
	}

	return result;
}

/** [lat, lon] tuples in, GeoJSON [lon, lat] coordinate tuples out */
export async function fetchOSRMRoute(
	points: [number, number][],
	mode: 'driving' | 'flight' | 'train' | 'walking' | 'cycling' | 'direct' = 'driving'
): Promise<[number, number][]> {
	if (mode === 'flight' || mode === 'direct') {
		return generateFlightArc(points);
	}

	let osrmProfile = 'driving';
	if (mode === 'walking') osrmProfile = 'foot';
	if (mode === 'cycling') osrmProfile = 'bicycling';

	try {
		const coordsStr = points.map((p) => `${p[1]},${p[0]}`).join(';');
		const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${coordsStr}?overview=full&geometries=geojson`;
		const response = await fetch(url);
		const data = await response.json();
		if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
			return data.routes[0].geometry.coordinates;
		}
	} catch (e) {
		console.error('Failed to fetch OSRM route:', e);
	}

	// Fallback to curved arc or direct points
	return generateFlightArc(points);
}

