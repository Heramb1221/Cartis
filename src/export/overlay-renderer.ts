import { hexToRgba } from '../core/utils';
import { formatCoords } from '../map/geocoder';
import { computeScaleBar } from '../core/scale-bar';
import type { CartisState } from '../types/state';
import type { ArtisticTheme, RasterTheme } from '../types/themes';

type ActiveTheme = (ArtisticTheme | RasterTheme) & { bg?: string; background?: string; text?: string; textColor?: string };

const TEXT_SCALE_REFERENCE = 1080;
const OVERLAY_SIZE_MULTIPLIER: Record<string, number> = {
	small: 0.75,
	medium: 1,
	large: 1.35,
};

/**
 * These constants intentionally differ from the ones in ui/form.ts's live
 * DOM preview (gap/dividerHeight in particular). That divergence already
 * existed between the original app's live-preview layout and its
 * html2canvas export layout — this file is the direct replacement for the
 * latter, so it carries forward the export-specific values rather than
 * unifying them with the preview.
 */
const BASE_OVERLAY_TEXT = {
	pad: 48,
	city: 64,
	country: 20,
	coords: 16,
	gap: 8,
	cityGap: 40,
	dividerWidth: 128,
	dividerHeight: 1.5,
	attribution: 8,
	attributionOffset: 12,
};

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function getPosterTextScale(width: number, height: number): number {
	const shortestSide = Math.max(1, Math.min(width || TEXT_SCALE_REFERENCE, height || TEXT_SCALE_REFERENCE));
	return shortestSide / TEXT_SCALE_REFERENCE;
}

interface OverlayTextConfig {
	pad: number;
	city: number;
	country: number;
	coords: number;
	gap: number;
	cityGap: number;
	dividerWidth: number;
	dividerHeight: number;
	attribution: number;
	attributionOffset: number;
}

/**
 * width/height here are the actual output canvas dimensions (post iOS
 * pixel-count clamping), not the nominal poster size — so text stays
 * proportionally correct relative to whatever canvas it's actually drawn
 * onto, even if the requested resolution had to be scaled down.
 */
export function getOverlayTextConfig(width: number, height: number, size = 'medium'): OverlayTextConfig {
	const posterScale = getPosterTextScale(width, height);
	const sizeMultiplier = OVERLAY_SIZE_MULTIPLIER[size] || OVERLAY_SIZE_MULTIPLIER.medium!;
	const scale = posterScale * sizeMultiplier;

	return {
		pad: clamp(BASE_OVERLAY_TEXT.pad * scale, 12, 480),
		city: clamp(BASE_OVERLAY_TEXT.city * scale, 28, 420),
		country: clamp(BASE_OVERLAY_TEXT.country * scale, 10, 150),
		coords: clamp(BASE_OVERLAY_TEXT.coords * scale, 9, 120),
		gap: clamp(BASE_OVERLAY_TEXT.gap * scale, 4, 90),
		cityGap: clamp(BASE_OVERLAY_TEXT.cityGap * scale, 12, 280),
		dividerWidth: clamp(BASE_OVERLAY_TEXT.dividerWidth * scale, 72, 900),
		dividerHeight: clamp(BASE_OVERLAY_TEXT.dividerHeight * scale, 1, 12),
		attribution: clamp(BASE_OVERLAY_TEXT.attribution * scale, 6, 72),
		attributionOffset: clamp(BASE_OVERLAY_TEXT.attributionOffset * scale, 8, 120),
	};
}

/** Measures a line's width honoring manual letter-spacing (no trailing gap after the last char, unlike CSS letter-spacing — this is the more correct behavior for true centering). */
function measureTrackedWidth(ctx: CanvasRenderingContext2D, text: string, letterSpacingPx: number): number {
	const chars = Array.from(text);
	if (chars.length === 0) return 0;
	let width = 0;
	for (const ch of chars) width += ctx.measureText(ch).width;
	width += letterSpacingPx * (chars.length - 1);
	return width;
}

/** Draws a line of tracked (letter-spaced) text horizontally centered at centerX, returns the drawn width. Assumes ctx.font/fillStyle already set. */
function drawTrackedTextCentered(ctx: CanvasRenderingContext2D, text: string, centerX: number, y: number, letterSpacingPx: number): number {
	const chars = Array.from(text);
	const totalWidth = measureTrackedWidth(ctx, text, letterSpacingPx);
	const prevAlign = ctx.textAlign;
	ctx.textAlign = 'left';
	let x = centerX - totalWidth / 2;
	for (const ch of chars) {
		ctx.fillText(ch, x, y);
		x += ctx.measureText(ch).width + letterSpacingPx;
	}
	ctx.textAlign = prevAlign;
	return totalWidth;
}

function drawVignetteOrRadial(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, type: 'vignette' | 'radial', color: string): void {
	if (w <= 0 || h <= 0) return;
	ctx.save();
	if (type === 'vignette') {
		const grad = ctx.createLinearGradient(0, y, 0, y + h);
		const solid = hexToRgba(color, 1);
		const trans = hexToRgba(color, 0);
		grad.addColorStop(0, solid);
		grad.addColorStop(0.03, solid);
		grad.addColorStop(0.2, trans);
		grad.addColorStop(0.8, trans);
		grad.addColorStop(0.97, solid);
		grad.addColorStop(1, solid);
		ctx.fillStyle = grad;
		ctx.fillRect(x, y, w, h);
	} else {
		const cx = x + w / 2;
		const cy = y + h / 2;
		const r = Math.sqrt(w * w + h * h) / 2;
		const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
		const solid = hexToRgba(color, 1);
		const trans = hexToRgba(color, 0);
		grad.addColorStop(0, trans);
		grad.addColorStop(0.2, trans);
		grad.addColorStop(0.7, hexToRgba(color, 0.4));
		grad.addColorStop(1, solid);
		ctx.fillStyle = grad;
		ctx.fillRect(x, y, w, h);
	}
	ctx.restore();
}

/**
 * Renders the full poster overlay (mat border, vignette/radial background,
 * city/divider/country/coords text block, attribution) directly to a
 * transparent canvas at (width, height) — the output canvas's own pixel
 * dimensions, already clamped for iOS canvas limits by the caller.
 *
 * matWidthOutput must be pre-scaled into the same pixel space as
 * width/height (i.e. if the caller clamped the overall output size, this
 * should be the mat width scaled by that same ratio) so the mat, map
 * snapshot, and text block all agree on where the inset boundary is.
 */
export function renderOverlayCanvas(state: CartisState, activeTheme: ActiveTheme, width: number, height: number, matWidthOutput: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Could not acquire 2D canvas context for overlay rendering');

	const textColor = activeTheme.text || activeTheme.textColor || '#000000';
	const bgColor = activeTheme.bg || activeTheme.background || '#ffffff';

	// 1. Mat border — stroked just inside the mat inset boundary
	if (state.matEnabled && state.matShowBorder) {
		const borderWidth = Math.max(1, (state.matBorderWidth || 1) * (matWidthOutput > 0 ? width / state.width : 1));
		ctx.save();
		ctx.globalAlpha = state.matBorderOpacity ?? 1;
		ctx.strokeStyle = textColor;
		ctx.lineWidth = borderWidth;
		ctx.strokeRect(
			matWidthOutput + borderWidth / 2,
			matWidthOutput + borderWidth / 2,
			Math.max(0, width - 2 * matWidthOutput - borderWidth),
			Math.max(0, height - 2 * matWidthOutput - borderWidth),
		);
		ctx.restore();
	}

	const overlaySize = state.overlaySize || 'medium';
	const showTextBlock = overlaySize !== ('none' as CartisState['overlaySize']);

	// 2. Vignette/radial background, within the mat-inset area
	const bgType = (state.overlayBgType || 'vignette') as string;
	if (bgType === 'vignette' || bgType === 'radial') {
		drawVignetteOrRadial(ctx, matWidthOutput, matWidthOutput, width - 2 * matWidthOutput, height - 2 * matWidthOutput, bgType as 'vignette' | 'radial', bgColor);
	}

	// 3. Text block: city -> divider -> country -> coords, vertically stacked and centered as a group
	if (showTextBlock) {
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

		interface Line {
			text: string;
			fontPx: number;
			fontWeight: string;
			fontFamily: string;
			letterSpacingEm: number;
			lineHeightFactor: number;
			gapAbove: number;
			isDivider?: boolean;
		}

		const lines: Line[] = [
			{ text: cityText, fontPx: sizeConfig.city, fontWeight: 'bold', fontFamily: state.cityFont, letterSpacingEm: 0.25, lineHeightFactor: 1.12, gapAbove: 0 },
		];
		if (showDivider) {
			lines.push({ text: '', fontPx: sizeConfig.dividerHeight, fontWeight: '', fontFamily: '', letterSpacingEm: 0, lineHeightFactor: 1, gapAbove: sizeConfig.cityGap, isDivider: true });
		}
		if (showCountry) {
			lines.push({ text: countryText, fontPx: sizeConfig.country, fontWeight: 'bold', fontFamily: state.countryFont, letterSpacingEm: 0.4, lineHeightFactor: 1.2, gapAbove: sizeConfig.gap });
		}
		if (showCoords) {
			lines.push({ text: coordsText, fontPx: sizeConfig.coords, fontWeight: '500', fontFamily: state.coordsFont, letterSpacingEm: 0.4, lineHeightFactor: 1.2, gapAbove: sizeConfig.gap });
		}

		// First measurement pass (font must be set before ctx.measureText is meaningful)
		let totalHeight = 0;
		let maxWidth = 0;
		const measured = lines.map((line) => {
			totalHeight += line.gapAbove;
			if (line.isDivider) {
				totalHeight += line.fontPx;
				maxWidth = Math.max(maxWidth, sizeConfig.dividerWidth);
				return { ...line, width: sizeConfig.dividerWidth, boxHeight: line.fontPx };
			}
			ctx.font = `${line.fontWeight} ${line.fontPx}px ${line.fontFamily}`;
			const letterSpacingPx = line.fontPx * line.letterSpacingEm;
			const width_ = measureTrackedWidth(ctx, line.text, letterSpacingPx);
			const boxHeight = line.fontPx * line.lineHeightFactor;
			totalHeight += boxHeight;
			maxWidth = Math.max(maxWidth, width_);
			return { ...line, width: width_, boxHeight };
		});

		const overlayX = state.overlayX !== undefined ? state.overlayX : 0.5;
		const overlayY = state.overlayY !== undefined ? state.overlayY : 0.85;
		const EDGE = 8;
		const halfW = maxWidth / 2 + sizeConfig.pad;
		const halfH = totalHeight / 2 + sizeConfig.pad;
		const clampedX = width > 0 && halfW > 0 ? clamp(overlayX, (halfW + EDGE) / width, 1 - (halfW + EDGE) / width) : overlayX;
		const clampedY = height > 0 && halfH > 0 ? clamp(overlayY, (halfH + EDGE) / height, 1 - (halfH + EDGE) / height) : overlayY;

		const anchorX = clampedX * width;
		const blockTop = clampedY * height - totalHeight / 2;

		let cursorY = blockTop;
		ctx.fillStyle = textColor;
		ctx.textBaseline = 'top';

		for (const line of measured) {
			cursorY += line.gapAbove;
			if (line.isDivider) {
				ctx.save();
				ctx.fillStyle = textColor;
				ctx.fillRect(anchorX - sizeConfig.dividerWidth / 2, cursorY, sizeConfig.dividerWidth, sizeConfig.dividerHeight);
				ctx.restore();
			} else {
				ctx.font = `${line.fontWeight} ${line.fontPx}px ${line.fontFamily}`;
				ctx.fillStyle = textColor;
				const letterSpacingPx = line.fontPx * line.letterSpacingEm;
				// vertically center the glyph within its line box (top-baseline offset approximation)
				const textY = cursorY + (line.boxHeight - line.fontPx) / 2;
				drawTrackedTextCentered(ctx, line.text.toUpperCase(), anchorX, textY, letterSpacingPx);
			}
			cursorY += line.boxHeight;
		}
	}

	// 4. Attribution — bottom-right, independent of the text block, respects the mat inset
	const attribution = '© OpenStreetMap Contributors';
	const attrConfig = getOverlayTextConfig(width, height, overlaySize === ('none' as CartisState['overlaySize']) ? 'medium' : overlaySize);
	const attrFontPx = attrConfig.attribution;
	const attrOffset = attrConfig.attributionOffset;
	const attrLetterSpacingPx = attrFontPx * 0.1;

	ctx.save();
	ctx.globalAlpha = 0.35;
	ctx.fillStyle = textColor;
	ctx.font = `${attrFontPx}px sans-serif`;
	ctx.textBaseline = 'alphabetic';
	const attrWidth = measureTrackedWidth(ctx, attribution.toUpperCase(), attrLetterSpacingPx);
	const attrX = width - matWidthOutput - attrOffset - attrWidth;
	const attrY = height - matWidthOutput - attrOffset;
	drawTrackedTextCentered(ctx, attribution.toUpperCase(), attrX + attrWidth / 2, attrY, attrLetterSpacingPx);
	ctx.restore();

	// QR Code Badge drawing if enabled
	if (state.showQrCode && state.qrCodeUrl) {
		const qrSize = Math.max(48, width * 0.08);
		const pad = Math.max(16, width * 0.02);
		const qrX = matWidthOutput + pad;
		const qrY = height - matWidthOutput - pad - qrSize;
		ctx.save();
		ctx.fillStyle = '#ffffff';
		ctx.shadowColor = 'rgba(0,0,0,0.2)';
		ctx.shadowBlur = 10;
		ctx.fillRect(qrX, qrY, qrSize, qrSize);
		ctx.fillStyle = textColor;
		ctx.font = `${Math.max(8, qrSize * 0.15)}px sans-serif`;
		ctx.textAlign = 'center';
		ctx.fillText('QR CODE', qrX + qrSize / 2, qrY + qrSize / 2 - 4);
		ctx.restore();
	}

	// 5. Print border — thin rule flush with the poster edge, independent of the mat border
	if (state.showPrintBorder) {
		ctx.save();
		ctx.strokeStyle = textColor;
		const lw = Math.max(1, width / 540); // scales with resolution, ~2px at a 1080px reference size
		ctx.lineWidth = lw;
		ctx.strokeRect(lw / 2, lw / 2, width - lw, height - lw);
		ctx.restore();
	}

	// 6. Scale bar — bottom-left, respects the mat inset
	if (state.showScaleBar) {
		const maxBarPx = width * 0.15;
		const spec = computeScaleBar(state.lat, state.zoom, maxBarPx);
		if (spec.widthPx > 0) {
			const pad = Math.max(16, width * 0.02);
			const baseX = matWidthOutput + pad;
			const baseY = height - matWidthOutput - pad;
			const tickH = Math.max(4, width / 270);

			ctx.save();
			ctx.strokeStyle = textColor;
			ctx.lineWidth = Math.max(1.5, width / 720);
			ctx.beginPath();
			ctx.moveTo(baseX, baseY - tickH);
			ctx.lineTo(baseX, baseY);
			ctx.lineTo(baseX + spec.widthPx, baseY);
			ctx.lineTo(baseX + spec.widthPx, baseY - tickH);
			ctx.stroke();

			const labelFontPx = Math.max(9, width / 120);
			ctx.font = `bold ${labelFontPx}px sans-serif`;
			ctx.fillStyle = textColor;
			ctx.textBaseline = 'bottom';
			ctx.textAlign = 'left';
			ctx.fillText(spec.label.toUpperCase(), baseX, baseY - tickH - 4);
			ctx.restore();
		}
	}

	// 7. Compass rose — top-right, rotated opposite the map bearing so it always points true north
	if (state.showCompassRose) {
		const size = Math.max(24, width * 0.035);
		const pad = Math.max(16, width * 0.02);
		const cx = width - matWidthOutput - pad - size / 2;
		const cy = matWidthOutput + pad + size / 2;
		const bearing = state.bearing || 0;

		ctx.save();
		ctx.translate(cx, cy);
		ctx.rotate((-bearing * Math.PI) / 180);
		ctx.fillStyle = textColor;

		ctx.beginPath();
		ctx.moveTo(0, -size / 2);
		ctx.lineTo(size * 0.18, size * 0.1);
		ctx.lineTo(0, 0);
		ctx.closePath();
		ctx.fill();

		ctx.globalAlpha = 0.4;
		ctx.beginPath();
		ctx.moveTo(0, size / 2);
		ctx.lineTo(-size * 0.18, size * 0.1);
		ctx.lineTo(0, 0);
		ctx.closePath();
		ctx.fill();
		ctx.globalAlpha = 1;

		ctx.font = `bold ${size * 0.22}px sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'bottom';
		ctx.fillText('N', 0, -size * 0.55);
		ctx.restore();
	}

	return canvas;
}
