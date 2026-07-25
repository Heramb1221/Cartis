import { getMapInstance, getArtisticMapInstance } from '../map/map-init';
import { state, getSelectedTheme, getSelectedArtisticTheme } from '../core/store';
import { markerIcons } from '../map/markers/marker-icons';
import { renderOverlayCanvas } from './overlay-renderer';
import type { MarkerIcon } from '../types/state';

interface Point {
	x: number;
	y: number;
}

function project(lat: number, lon: number, scale: number): Point {
	const siny = Math.sin((lat * Math.PI) / 180);
	const y = 0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI);
	return {
		x: ((lon + 180) / 360) * scale,
		y: y * scale,
	};
}

const IOS_MAX_CANVAS_PIXELS = 16777216;

/**
 * Clamps a requested output size to the shared iOS/Safari canvas pixel-count
 * ceiling, preserving aspect ratio. Computed once per export and threaded
 * through to both the map snapshot and the overlay renderer so they always
 * agree on the actual pixel dimensions — the html2canvas-era code clamped
 * these independently (map snapshot clamped its own effective area, the
 * overlay clamped the full poster size), which could drift out of sync.
 */
export function computeClampedOutputSize(width: number, height: number): { width: number; height: number } {
	let w = Math.max(1, width);
	let h = Math.max(1, height);
	if (w * h > IOS_MAX_CANVAS_PIXELS) {
		const ratio = Math.sqrt(IOS_MAX_CANVAS_PIXELS / (w * h));
		w = Math.floor(w * ratio);
		h = Math.floor(h * ratio);
	}
	return { width: w, height: h };
}

async function fetchTileAsBlobURL(src: string): Promise<string | null> {
	try {
		const resp = await fetch(src, { mode: 'cors', credentials: 'omit' });
		if (!resp.ok) return null;
		const blob = await resp.blob();
		return URL.createObjectURL(blob);
	} catch {
		return null;
	}
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => resolve(null);
		img.src = src;
	});
}

/**
 * Captures just the map layer (tiles/vector render + markers + route) as a
 * PNG data URL at exactly (effectiveWidth x effectiveHeight) — the
 * mat-inset area of the already-clamped output canvas. Caller is
 * responsible for computing effectiveWidth/effectiveHeight consistently
 * with whatever it passes to renderOverlayCanvas.
 */
export async function captureMapSnapshot(effectiveWidth: number, effectiveHeight: number): Promise<string | null> {
	const artisticContainer = document.getElementById('artistic-map');
	const mapPreviewContainer = document.getElementById('map-preview');
	const posterContainer = document.getElementById('poster-container');

	if (!posterContainer) return null;

	const isArtistic = state.renderMode === 'artistic';

	const canvasWidth = Math.max(1, Math.round(effectiveWidth));
	const canvasHeight = Math.max(1, Math.round(effectiveHeight));

	const canvas = document.createElement('canvas');
	canvas.width = canvasWidth;
	canvas.height = canvasHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	if (isArtistic) {
		const artisticMap = getArtisticMapInstance();
		if (artisticMap && artisticContainer) {
			try {
				const originalWidth = artisticContainer.style.width;
				const originalHeight = artisticContainer.style.height;
				const originalWidthPx = artisticContainer.offsetWidth;

				artisticContainer.style.width = `${canvasWidth}px`;
				artisticContainer.style.height = `${canvasHeight}px`;

				const routeLayers = ['route-line', 'route-line-casing', 'route-line-glow'];
				routeLayers.forEach((l) => {
					if (artisticMap.getLayer(l)) artisticMap.setLayoutProperty(l, 'visibility', 'none');
				});

				artisticMap.resize();

				let mapDataURL: string | null = null;
				await new Promise<void>((resolve) => {
					const timer = setTimeout(() => {
						try {
							mapDataURL = artisticMap.getCanvas().toDataURL();
						} catch {
							/* canvas may be tainted or empty mid-transition — snapshot falls back to a direct drawImage below */
						}
						resolve();
					}, 1500);
					artisticMap.once('idle', () => {
						clearTimeout(timer);
						try {
							mapDataURL = artisticMap.getCanvas().toDataURL();
						} catch {
							/* same fallback as above */
						}
						resolve();
					});
				});

				if (mapDataURL) {
					const mapImg = await loadImage(mapDataURL);
					if (mapImg) ctx.drawImage(mapImg, 0, 0, canvas.width, canvas.height);
				} else {
					const mapCanvas = artisticMap.getCanvas();
					ctx.drawImage(mapCanvas, 0, 0, canvas.width, canvas.height);
				}

				const scaleFactor = canvasWidth / (originalWidthPx || 500);

				if (state.showMarker && state.markers && state.markers.length > 0) {
					const zoom = artisticMap.getZoom();
					const center = artisticMap.getCenter();
					const scale = Math.pow(2, zoom) * 512;
					const centerPoint = project(center.lat, center.lng, scale);

					const theme = getSelectedArtisticTheme();
					const color = theme.route || '#EF4444';

					for (const markerData of state.markers) {
						const markerPoint = project(markerData.lat, markerData.lon, scale);
						const x = canvas.width / 2 + (markerPoint.x - centerPoint.x);
						const y = canvas.height / 2 + (markerPoint.y - centerPoint.y);
						await drawMarkerToCtx(ctx, x, y, color);
					}
				}

				if (state.showRoute) {
					const zoom = artisticMap.getZoom();
					const center = artisticMap.getCenter();
					const scale = Math.pow(2, zoom) * 512;
					const centerPoint = project(center.lat, center.lng, scale);

					const theme = getSelectedArtisticTheme();
					const color = theme.route || '#EF4444';
					const themeBg = theme.bg || '#ffffff';

					const geometry: [number, number][] =
						state.routeGeometry && state.routeGeometry.length > 0
							? state.routeGeometry
							: [
									[state.routeStartLon, state.routeStartLat],
									[state.routeEndLon, state.routeEndLat],
								];

					const points = geometry.map((c) => {
						const p = project(c[1]!, c[0]!, scale);
						return {
							x: canvas.width / 2 + (p.x - centerPoint.x),
							y: canvas.height / 2 + (p.y - centerPoint.y),
						};
					});

					drawComplexRouteToCtx(ctx, points, color, themeBg, scaleFactor);
				}

				const data = canvas.toDataURL('image/png');

				routeLayers.forEach((l) => {
					if (artisticMap.getLayer(l)) artisticMap.setLayoutProperty(l, 'visibility', 'visible');
				});

				artisticContainer.style.width = originalWidth;
				artisticContainer.style.height = originalHeight;
				artisticMap.resize();

				return data;
			} catch (e) {
				console.error('Failed to capture artistic map:', e);
			}
		}
	} else if (mapPreviewContainer) {
		try {
			const tiles = Array.from(mapPreviewContainer.querySelectorAll('img.leaflet-tile')) as HTMLImageElement[];

			const containerRect = mapPreviewContainer.getBoundingClientRect();

			const scaleFactor = canvasWidth / containerRect.width;

			const tileData = tiles
				.filter((tile) => tile.complete && tile.naturalWidth > 0)
				.map((tile) => {
					const tileRect = tile.getBoundingClientRect();
					return {
						src: tile.src,
						x: (tileRect.left - containerRect.left) * scaleFactor,
						y: (tileRect.top - containerRect.top) * scaleFactor,
						w: tileRect.width * scaleFactor,
						h: tileRect.height * scaleFactor,
					};
				});

			await Promise.all(
				tileData.map(async (td) => {
					let blobURL = await fetchTileAsBlobURL(td.src);
					if (!blobURL) {
						blobURL = td.src;
					}
					const img = await loadImage(blobURL);
					if (img) ctx.drawImage(img, td.x, td.y, td.w, td.h);
					if (blobURL.startsWith('blob:')) URL.revokeObjectURL(blobURL);
				}),
			);

			const map = getMapInstance();

			if (state.showMarker && state.markers && state.markers.length > 0 && map) {
				const zoom = map.getZoom();
				const center = map.getCenter();
				const scaleMap = Math.pow(2, zoom) * 256;
				const centerPoint = project(center.lat, center.lng, scaleMap);

				const theme = getSelectedTheme();
				const color = theme.route || '#EF4444';

				for (const markerData of state.markers) {
					const markerPoint = project(markerData.lat, markerData.lon, scaleMap);
					const x = canvas.width / 2 + (markerPoint.x - centerPoint.x);
					const y = canvas.height / 2 + (markerPoint.y - centerPoint.y);
					await drawMarkerToCtx(ctx, x, y, color);
				}
			}

			if (state.showRoute && map) {
				const zoom = map.getZoom();
				const center = map.getCenter();
				const scaleMap = Math.pow(2, zoom) * 256;
				const centerPoint = project(center.lat, center.lng, scaleMap);

				const theme = getSelectedTheme();
				const themeBg = theme.background || '#ffffff';
				const routeColor = theme.route || '#EF4444';

				const via = state.routeViaPoints || [];
				const geometry: [number, number][] =
					state.routeGeometry && state.routeGeometry.length > 0
						? state.routeGeometry
						: [[state.routeStartLon, state.routeStartLat], ...via.map((p): [number, number] => [p.lon, p.lat]), [state.routeEndLon, state.routeEndLat]];

				const points = geometry.map((c) => {
					const p = project(c[1]!, c[0]!, scaleMap);
					return {
						x: canvas.width / 2 + (p.x - centerPoint.x),
						y: canvas.height / 2 + (p.y - centerPoint.y),
					};
				});

				drawComplexRouteToCtx(ctx, points, routeColor, themeBg, scaleFactor);
			}

			return canvas.toDataURL('image/png');
		} catch (e) {
			console.error('Failed to capture Leaflet map:', e);
		}
	}
	return null;
}

function drawComplexRouteToCtx(ctx: CanvasRenderingContext2D, points: Point[], color: string, themeBg = '#ffffff', scaleFactor = 1): void {
	if (!points || points.length < 2) return;

	const mainWidth = 4 * scaleFactor;
	const casingWidth = 9 * scaleFactor;

	ctx.beginPath();
	ctx.moveTo(points[0]!.x, points[0]!.y);
	for (let i = 1; i < points.length; i++) {
		ctx.lineTo(points[i]!.x, points[i]!.y);
	}
	ctx.strokeStyle = themeBg;
	ctx.lineWidth = casingWidth;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.stroke();

	ctx.beginPath();
	ctx.moveTo(points[0]!.x, points[0]!.y);
	for (let i = 1; i < points.length; i++) {
		ctx.lineTo(points[i]!.x, points[i]!.y);
	}
	ctx.strokeStyle = color;
	ctx.lineWidth = mainWidth;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.stroke();

	const drawPoint = (x: number, y: number, label: string) => {
		const dotSize = 12 * scaleFactor;
		ctx.beginPath();
		ctx.arc(x, y, dotSize, 0, Math.PI * 2);
		ctx.fillStyle = '#ffffff';
		ctx.fill();
		ctx.strokeStyle = '#0f172a';
		ctx.lineWidth = 1.5 * scaleFactor;
		ctx.stroke();

		ctx.fillStyle = '#0f172a';
		ctx.font = `bold ${10 * scaleFactor}px sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(label, x, y);
	};
	drawPoint(points[0]!.x, points[0]!.y, 'A');
	drawPoint(points[points.length - 1]!.x, points[points.length - 1]!.y, 'B');
}

async function drawMarkerToCtx(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): Promise<void> {
	const iconType: MarkerIcon = state.markerIcon || 'pin';
	const baseSize = 40;
	const size = Math.round(baseSize * (state.markerSize || 1));
	const svgString = markerIcons[iconType] || markerIcons.pin;
	const svg = svgString.replace('currentColor', color).replace('width="100"', `width="${size}"`).replace('height="100"', `height="${size}"`);

	return new Promise((resolve) => {
		const img = new Image();
		let url: string;
		try {
			url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
		} catch {
			url = 'data:image/svg+xml,' + encodeURIComponent(svg);
		}
		img.onload = () => {
			const anchorX = size / 2;
			const anchorY = iconType === 'pin' ? size : size / 2;
			ctx.drawImage(img, x - anchorX, y - anchorY, size, size);
			resolve();
		};
		img.onerror = () => resolve();
		img.src = url;
	});
}

/**
 * Composes the full poster (map snapshot + overlay) onto a single canvas
 * at (targetWidth x targetHeight), clamped for the shared iOS canvas
 * pixel-count ceiling. Defaults to the current state.width/height when no
 * override is given. Shared by PNG, PDF, and batch export so they can't
 * drift out of sync with each other.
 */
export async function composePosterCanvas(targetWidth?: number, targetHeight?: number): Promise<HTMLCanvasElement> {
	if (document.fonts && document.fonts.ready) {
		try {
			await document.fonts.ready;
		} catch {
			/* font loading can reject in some embedders — export proceeds with whatever fonts are already available */
		}
	}

	const nominalW = targetWidth ?? state.width;
	const nominalH = targetHeight ?? state.height;

	const { width: outputW, height: outputH } = computeClampedOutputSize(nominalW, nominalH);
	const matWidthOutput = state.matEnabled ? Math.round((state.matWidth * outputW) / nominalW) : 0;
	const effectiveW = Math.max(1, outputW - 2 * matWidthOutput);
	const effectiveH = Math.max(1, outputH - 2 * matWidthOutput);

	const snapshot = await captureMapSnapshot(effectiveW, effectiveH);

	const isArtistic = state.renderMode === 'artistic';
	const activeTheme = isArtistic ? getSelectedArtisticTheme() : getSelectedTheme();
	const bgColor = (activeTheme as { background?: string; bg?: string }).background || (activeTheme as { background?: string; bg?: string }).bg || '#ffffff';

	// renderOverlayCanvas reads state.width/height internally for its own text-scale
	// reference — when rendering a batch preset at a different size than the live
	// state, temporarily borrow the target dimensions so text scales correctly for
	// that specific output rather than the editor's current canvas size.
	const overlayState = targetWidth !== undefined || targetHeight !== undefined ? { ...state, width: nominalW, height: nominalH } : state;
	const overlayCanvas = renderOverlayCanvas(overlayState, activeTheme, outputW, outputH, matWidthOutput);

	const finalCanvas = document.createElement('canvas');
	finalCanvas.width = outputW;
	finalCanvas.height = outputH;
	const finalCtx = finalCanvas.getContext('2d');
	if (!finalCtx) throw new Error('Could not acquire 2D canvas context for export compositing');

	finalCtx.fillStyle = bgColor;
	finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

	if (snapshot) {
		const snapImg = await loadImage(snapshot);
		if (snapImg) {
			finalCtx.drawImage(snapImg, matWidthOutput, matWidthOutput, effectiveW, effectiveH);
		}
	}

	finalCtx.drawImage(overlayCanvas, 0, 0);

	return finalCanvas;
}

/**
 * Full PNG export pipeline. `element` is accepted for signature
 * compatibility with the Phase 1 caller in main.ts but is no longer used:
 * the overlay is drawn directly rather than captured from the live
 * poster-container DOM.
 */
export async function exportToPNG(_element: HTMLElement | null, filename: string, statusElement: HTMLElement | null): Promise<void> {
	if (statusElement) statusElement.classList.remove('hidden');

	try {
		const finalCanvas = await composePosterCanvas();
		const link = document.createElement('a');
		link.download = filename;
		link.href = finalCanvas.toDataURL('image/png', 1.0);
		link.click();
	} catch (error) {
		console.error('Export failed:', error);
		alert('Export failed. Please check internet connection or try again.');
	} finally {
		if (statusElement) statusElement.classList.add('hidden');
	}
}
