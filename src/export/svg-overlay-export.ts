import { captureMapSnapshot, computeClampedOutputSize } from './png-export';
import { getOverlayTextConfig } from './overlay-renderer';
import { computeScaleBar } from '../core/scale-bar';
import { formatCoords } from '../map/geocoder';
import { state, getSelectedTheme, getSelectedArtisticTheme } from '../core/store';
import type { CartisState } from '../types/state';

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Rough text width estimate for centering/edge-clamp purposes — SVG's own text-anchor="middle" handles the actual visual centering, this is only used to keep the block from drifting off-canvas. */
function estimateTextWidth(ctx: CanvasRenderingContext2D, text: string, fontWeight: string, fontPx: number, fontFamily: string, letterSpacingPx: number): number {
	ctx.font = `${fontWeight} ${fontPx}px ${fontFamily}`;
	const chars = Array.from(text);
	let width = 0;
	for (const ch of chars) width += ctx.measureText(ch).width;
	if (chars.length > 0) width += letterSpacingPx * (chars.length - 1);
	return width;
}

export async function exportToSVG(filename: string, statusElement: HTMLElement | null): Promise<void> {
	if (statusElement) statusElement.classList.remove('hidden');

	try {
		const { width, height } = computeClampedOutputSize(state.width, state.height);
		const matWidthOutput = state.matEnabled ? Math.round((state.matWidth * width) / state.width) : 0;
		const effectiveW = Math.max(1, width - 2 * matWidthOutput);
		const effectiveH = Math.max(1, height - 2 * matWidthOutput);

		const snapshot = await captureMapSnapshot(effectiveW, effectiveH);

		const isArtistic = state.renderMode === 'artistic';
		const activeTheme = (isArtistic ? getSelectedArtisticTheme() : getSelectedTheme()) as { bg?: string; background?: string; text?: string; textColor?: string };
		const bgColor = activeTheme.bg || activeTheme.background || '#ffffff';
		const textColor = activeTheme.text || activeTheme.textColor || '#000000';

		const parts: string[] = [];
		parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
		parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${bgColor}" />`);

		if (snapshot) {
			parts.push(`<image x="${matWidthOutput}" y="${matWidthOutput}" width="${effectiveW}" height="${effectiveH}" href="${snapshot}" preserveAspectRatio="none" />`);
		}

		if (state.matEnabled && state.matShowBorder) {
			const bw = state.matBorderWidth || 1;
			parts.push(
				`<rect x="${matWidthOutput + bw / 2}" y="${matWidthOutput + bw / 2}" width="${Math.max(0, width - 2 * matWidthOutput - bw)}" height="${Math.max(0, height - 2 * matWidthOutput - bw)}" fill="none" stroke="${textColor}" stroke-width="${bw}" opacity="${state.matBorderOpacity ?? 1}" />`,
			);
		}

		const overlaySize = state.overlaySize || 'medium';
		const bgType = state.overlayBgType || 'vignette';
		if (overlaySize !== ('none' as CartisState['overlaySize']) && (bgType === 'vignette' || bgType === 'radial')) {
			const gradId = 'cartisVignette';
			if (bgType === 'vignette') {
				parts.push(
					`<linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">` +
						`<stop offset="0%" stop-color="${bgColor}" stop-opacity="1"/>` +
						`<stop offset="3%" stop-color="${bgColor}" stop-opacity="1"/>` +
						`<stop offset="20%" stop-color="${bgColor}" stop-opacity="0"/>` +
						`<stop offset="80%" stop-color="${bgColor}" stop-opacity="0"/>` +
						`<stop offset="97%" stop-color="${bgColor}" stop-opacity="1"/>` +
						`<stop offset="100%" stop-color="${bgColor}" stop-opacity="1"/>` +
						`</linearGradient>`,
				);
			} else {
				parts.push(
					`<radialGradient id="${gradId}">` +
						`<stop offset="0%" stop-color="${bgColor}" stop-opacity="0"/>` +
						`<stop offset="20%" stop-color="${bgColor}" stop-opacity="0"/>` +
						`<stop offset="70%" stop-color="${bgColor}" stop-opacity="0.4"/>` +
						`<stop offset="100%" stop-color="${bgColor}" stop-opacity="1"/>` +
						`</radialGradient>`,
				);
			}
			parts.push(`<rect x="${matWidthOutput}" y="${matWidthOutput}" width="${effectiveW}" height="${effectiveH}" fill="url(#${gradId})" />`);
		}

		if (overlaySize !== ('none' as CartisState['overlaySize'])) {
			const sizeConfig = getOverlayTextConfig(width, height, overlaySize);
			const badgeStyle = state.overlayBadgeStyle || 'standard';
			let cityText = state.cityOverride && state.cityOverride.length ? state.cityOverride : state.city;
			let countryText = state.countryOverride && state.countryOverride.length ? state.countryOverride : state.country;
			let coordsText = formatCoords(state.lat, state.lon);

			if (badgeStyle === 'travel_stats') {
				const startName = state.routeStartCity || 'ORIGIN';
				const endName = state.routeEndCity || 'DESTINATION';
				const mode = (state.travelMode || 'driving').toUpperCase();
				const distance = state.routeDistanceKm ? `${state.routeDistanceKm} KM (${state.routeDistanceMiles} MI)` : 'JOURNEY';

				cityText = `${startName} ➔ ${endName}`;
				countryText = `${mode} ROUTE · ${distance}`;
				coordsText = `${formatCoords(state.routeStartLat, state.routeStartLon)} ➔ ${formatCoords(state.routeEndLat, state.routeEndLon)}`;
			} else if (badgeStyle === 'boarding_pass') {
				const startName = state.routeStartCity || 'ORIGIN';
				const endName = state.routeEndCity || 'DESTINATION';
				const mode = (state.travelMode || 'flight').toUpperCase();

				cityText = `✈ ${startName} / ${endName}`;
				countryText = `BOARDING PASS · ${mode} · ${state.routeDistanceKm || 0} KM`;
				coordsText = `TICKET NO. CARTIS-${Math.abs(Math.round(state.routeStartLat * 100))}`;
			}

			const showCountry = (state.showCountry !== false || badgeStyle !== 'standard') && !!countryText;
			const showCoords = state.showCoords !== false || badgeStyle !== 'standard';
			const showDivider = showCountry || showCoords;

			const measureCanvas = document.createElement('canvas').getContext('2d')!;

			interface Line {
				text: string;
				fontPx: number;
				fontWeight: string;
				fontFamily: string;
				letterSpacingPx: number;
				lineHeightFactor: number;
				gapAbove: number;
				isDivider?: boolean;
			}
			const lines: Line[] = [
				{ text: cityText, fontPx: sizeConfig.city, fontWeight: 'bold', fontFamily: state.cityFont, letterSpacingPx: sizeConfig.city * 0.25, lineHeightFactor: 1.12, gapAbove: 0 },
			];
			if (showDivider) lines.push({ text: '', fontPx: sizeConfig.dividerHeight, fontWeight: '', fontFamily: '', letterSpacingPx: 0, lineHeightFactor: 1, gapAbove: sizeConfig.cityGap, isDivider: true });
			if (showCountry)
				lines.push({ text: countryText, fontPx: sizeConfig.country, fontWeight: 'bold', fontFamily: state.countryFont, letterSpacingPx: sizeConfig.country * 0.4, lineHeightFactor: 1.2, gapAbove: sizeConfig.gap });
			if (showCoords)
				lines.push({ text: coordsText, fontPx: sizeConfig.coords, fontWeight: '500', fontFamily: state.coordsFont, letterSpacingPx: sizeConfig.coords * 0.4, lineHeightFactor: 1.2, gapAbove: sizeConfig.gap });

			let totalHeight = 0;
			let maxWidth = 0;
			const measured = lines.map((line) => {
				totalHeight += line.gapAbove;
				const boxHeight = line.isDivider ? line.fontPx : line.fontPx * line.lineHeightFactor;
				totalHeight += boxHeight;
				const w = line.isDivider ? sizeConfig.dividerWidth : estimateTextWidth(measureCanvas, line.text.toUpperCase(), line.fontWeight, line.fontPx, line.fontFamily, line.letterSpacingPx);
				maxWidth = Math.max(maxWidth, w);
				return { ...line, boxHeight };
			});

			const overlayX = state.overlayX !== undefined ? state.overlayX : 0.5;
			const overlayY = state.overlayY !== undefined ? state.overlayY : 0.85;
			const EDGE = 8;
			const halfW = maxWidth / 2 + sizeConfig.pad;
			const halfH = totalHeight / 2 + sizeConfig.pad;
			const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
			const clampedX = width > 0 && halfW > 0 ? clamp(overlayX, (halfW + EDGE) / width, 1 - (halfW + EDGE) / width) : overlayX;
			const clampedY = height > 0 && halfH > 0 ? clamp(overlayY, (halfH + EDGE) / height, 1 - (halfH + EDGE) / height) : overlayY;
			const anchorX = clampedX * width;
			let cursorY = clampedY * height - totalHeight / 2;

			parts.push(`<g fill="${textColor}">`);
			for (const line of measured) {
				cursorY += line.gapAbove;
				if (line.isDivider) {
					parts.push(`<rect x="${anchorX - sizeConfig.dividerWidth / 2}" y="${cursorY}" width="${sizeConfig.dividerWidth}" height="${sizeConfig.dividerHeight}" fill="${textColor}" />`);
				} else {
					const baselineY = cursorY + line.boxHeight - (line.boxHeight - line.fontPx) / 2 - line.fontPx * 0.2;
					parts.push(
						`<text x="${anchorX}" y="${baselineY}" text-anchor="middle" font-family="${esc(line.fontFamily)}" font-weight="${line.fontWeight}" font-size="${line.fontPx}" letter-spacing="${line.letterSpacingPx}">${esc(line.text.toUpperCase())}</text>`,
					);
				}
				cursorY += line.boxHeight;
			}
			parts.push(`</g>`);
		}

		// attribution
		const attrConfig = getOverlayTextConfig(width, height, overlaySize === ('none' as CartisState['overlaySize']) ? 'medium' : overlaySize);
		parts.push(
			`<text x="${width - matWidthOutput - attrConfig.attributionOffset}" y="${height - matWidthOutput - attrConfig.attributionOffset}" text-anchor="end" font-family="sans-serif" font-size="${attrConfig.attribution}" letter-spacing="${attrConfig.attribution * 0.1}" fill="${textColor}" opacity="0.35">© OPENSTREETMAP CONTRIBUTORS</text>`,
		);

		if (state.showPrintBorder) {
			const lw = Math.max(1, width / 540);
			parts.push(`<rect x="${lw / 2}" y="${lw / 2}" width="${width - lw}" height="${height - lw}" fill="none" stroke="${textColor}" stroke-width="${lw}" />`);
		}

		if (state.showScaleBar) {
			const maxBarPx = width * 0.15;
			const spec = computeScaleBar(state.lat, state.zoom, maxBarPx);
			if (spec.widthPx > 0) {
				const pad = Math.max(16, width * 0.02);
				const baseX = matWidthOutput + pad;
				const baseY = height - matWidthOutput - pad;
				const tickH = Math.max(4, width / 270);
				parts.push(
					`<path d="M ${baseX} ${baseY - tickH} L ${baseX} ${baseY} L ${baseX + spec.widthPx} ${baseY} L ${baseX + spec.widthPx} ${baseY - tickH}" fill="none" stroke="${textColor}" stroke-width="${Math.max(1.5, width / 720)}" />` +
						`<text x="${baseX}" y="${baseY - tickH - 4}" font-family="sans-serif" font-weight="bold" font-size="${Math.max(9, width / 120)}" fill="${textColor}">${esc(spec.label.toUpperCase())}</text>`,
				);
			}
		}

		if (state.showCompassRose) {
			const size = Math.max(24, width * 0.035);
			const pad = Math.max(16, width * 0.02);
			const cx = width - matWidthOutput - pad - size / 2;
			const cy = matWidthOutput + pad + size / 2;
			const bearing = state.bearing || 0;
			parts.push(
				`<g transform="translate(${cx},${cy}) rotate(${-bearing})" fill="${textColor}">` +
					`<polygon points="0,${-size / 2} ${size * 0.18},${size * 0.1} 0,0" />` +
					`<polygon points="0,${size / 2} ${-size * 0.18},${size * 0.1} 0,0" opacity="0.4" />` +
					`<text x="0" y="${-size * 0.55}" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="${size * 0.22}">N</text>` +
					`</g>`,
			);
		}

		parts.push(`</svg>`);

		const blob = new Blob([parts.join('')], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.download = filename;
		link.href = url;
		link.click();
		URL.revokeObjectURL(url);
	} catch (error) {
		console.error('SVG export failed:', error);
		alert('SVG export failed. Please try again.');
	} finally {
		if (statusElement) statusElement.classList.add('hidden');
	}
}
