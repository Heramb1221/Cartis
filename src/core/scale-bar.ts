const NICE_DISTANCES_M = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];

/** Standard Web Mercator meters-per-pixel formula at a given latitude/zoom (256px tiles, matching both Leaflet's and MapLibre's zoom convention). */
export function metersPerPixel(latitude: number, zoom: number): number {
	return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

export interface ScaleBarSpec {
	label: string;
	widthPx: number;
}

/** Picks the largest "nice" round distance whose on-screen width fits within maxBarPx, and returns both the label and the exact pixel width to draw. */
export function computeScaleBar(latitude: number, zoom: number, maxBarPx: number): ScaleBarSpec {
	const mPerPx = metersPerPixel(latitude, zoom);
	if (!isFinite(mPerPx) || mPerPx <= 0) return { label: '', widthPx: 0 };

	const maxDistanceM = mPerPx * maxBarPx;
	let chosen = NICE_DISTANCES_M[0]!;
	for (const d of NICE_DISTANCES_M) {
		if (d <= maxDistanceM) chosen = d;
		else break;
	}

	const widthPx = chosen / mPerPx;
	const label = chosen >= 1000 ? `${chosen / 1000} km` : `${chosen} m`;
	return { label, widthPx };
}
