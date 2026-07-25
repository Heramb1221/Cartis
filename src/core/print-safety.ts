function hexToHsl(hex: string): { h: number; s: number; l: number } {
	let h = hex.replace('#', '');
	if (h.length === 3) {
		const [r, g, b] = h;
		h = `${r}${r}${g}${g}${b}${b}`;
	}
	const r = (parseInt(h.slice(0, 2), 16) || 0) / 255;
	const g = (parseInt(h.slice(2, 4), 16) || 0) / 255;
	const b = (parseInt(h.slice(4, 6), 16) || 0) / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	let s = 0;
	let hue = 0;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r:
				hue = (g - b) / d + (g < b ? 6 : 0);
				break;
			case g:
				hue = (b - r) / d + 2;
				break;
			default:
				hue = (r - g) / d + 4;
		}
		hue /= 6;
	}

	return { h: hue, s, l };
}

/**
 * Heuristic, not a color-science guarantee: highly saturated colors in the
 * vivid midtone range (think neon cyan, magenta, electric blue) are the
 * colors that most commonly fall outside the CMYK gamut and print
 * noticeably duller/shifted than they preview on an RGB screen. This
 * flags that pattern; it does not simulate an actual ICC profile
 * conversion.
 */
export function isPrintUnsafeColor(hex: string): boolean {
	if (!/^#[0-9a-fA-F]{3,6}$/.test(hex)) return false;
	const { s, l } = hexToHsl(hex);
	return s > 0.85 && l > 0.35 && l < 0.65;
}

export interface FlaggedColor {
	label: string;
	color: string;
}

/** Checks the fields on an artistic theme (or a subset of theme-shaped colors) and returns which ones are likely print-unsafe. */
export function checkPrintSafety(colors: Record<string, string | undefined>): FlaggedColor[] {
	const flagged: FlaggedColor[] = [];
	for (const [label, color] of Object.entries(colors)) {
		if (color && isPrintUnsafeColor(color)) flagged.push({ label, color });
	}
	return flagged;
}
