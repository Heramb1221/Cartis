/** Parses a GPX file's track points (and falls back to route points, then waypoints) into [lon, lat] pairs. */
export function parseGPX(gpxText: string): [number, number][] {
	const parser = new DOMParser();
	const doc = parser.parseFromString(gpxText, 'application/xml');

	const parserError = doc.querySelector('parsererror');
	if (parserError) throw new Error('Could not parse GPX file — invalid XML.');

	const pointsFrom = (tagName: string): [number, number][] => {
		const nodes = Array.from(doc.getElementsByTagName(tagName));
		const points: [number, number][] = [];
		for (const node of nodes) {
			const lat = parseFloat(node.getAttribute('lat') || '');
			const lon = parseFloat(node.getAttribute('lon') || '');
			if (isFinite(lat) && isFinite(lon)) points.push([lon, lat]);
		}
		return points;
	};

	const trackPoints = pointsFrom('trkpt');
	if (trackPoints.length > 0) return trackPoints;

	const routePoints = pointsFrom('rtept');
	if (routePoints.length > 0) return routePoints;

	const waypoints = pointsFrom('wpt');
	if (waypoints.length > 0) return waypoints;

	throw new Error('No track, route, or waypoints found in this GPX file.');
}
