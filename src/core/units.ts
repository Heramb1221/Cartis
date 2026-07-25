export function mmToPx(mm: number, dpi: number): number {
	return (mm / 25.4) * dpi;
}

export function pxToMm(px: number, dpi: number): number {
	return (px / dpi) * 25.4;
}

export function inToPx(inches: number, dpi: number): number {
	return inches * dpi;
}

export function pxToIn(px: number, dpi: number): number {
	return px / dpi;
}

export const DEFAULT_EXPORT_DPI = 300;
export const DEFAULT_BLEED_MM = 3;
