export function hexToRgba(color: string | undefined | null, alpha = 1): string {
	if (!color || typeof color !== 'string') return `rgba(255, 255, 255, ${alpha})`;

	if (color.startsWith('rgb')) {
		const matches = color.match(/\d+(\.\d+)?/g);
		if (matches && matches.length >= 3) {
			return `rgba(${matches[0]}, ${matches[1]}, ${matches[2]}, ${alpha})`;
		}
	}

	let h = color.replace('#', '');
	if (h.length === 3) {
		const [r, g, b] = h;
		h = `${r}${r}${g}${g}${b}${b}`;
	}

	if (!/^[0-9A-Fa-f]{6}$/.test(h)) return `rgba(255, 255, 255, ${alpha})`;

	const r = parseInt(h.substring(0, 2), 16);
	const g = parseInt(h.substring(2, 4), 16);
	const b = parseInt(h.substring(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface RoutePoint {
	lat: number;
	lon: number;
}

export function findBestInsertIndex(lat: number, lon: number, routePoints: RoutePoint[]): number {
	if (routePoints.length < 2) return 0;

	let bestIndex = 0;
	let minDistance = Infinity;

	for (let i = 0; i < routePoints.length - 1; i++) {
		const p1 = routePoints[i]!;
		const p2 = routePoints[i + 1]!;

		const dist = getSqSegDist(lat, lon, p1.lat, p1.lon, p2.lat, p2.lon);

		if (dist < minDistance) {
			minDistance = dist;
			bestIndex = i;
		}
	}

	return bestIndex;
}

export function getSqSegDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
	let dx = x2 - x1;
	let dy = y2 - y1;
	if (dx !== 0 || dy !== 0) {
		const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
		if (t > 1) {
			x1 = x2;
			y1 = y2;
		} else if (t > 0) {
			x1 += dx * t;
			y1 += dy * t;
		}
	}
	dx = px - x1;
	dy = py - y1;
	return dx * dx + dy * dy;
}
