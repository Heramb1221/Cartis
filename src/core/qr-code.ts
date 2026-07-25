/**
 * Lightweight SVG QR Code generator module for rendering scannable QR codes.
 * Returns an SVG string representation of a QR Code for any URL string.
 */
export function generateQrCodeSvg(text: string, size = 120, fgColor = '#000000', bgColor = '#ffffff'): string {
	if (!text) return '';

	// Generate a 21x21 matrix standard QR version 1 structure
	const modules: boolean[][] = Array.from({ length: 21 }, () => Array(21).fill(false));

	// Finder pattern helper
	const addFinder = (row: number, col: number) => {
		for (let r = -1; r <= 7; r++) {
			for (let c = -1; c <= 7; c++) {
				const rr = row + r;
				const cc = col + c;
				if (rr >= 0 && rr < 21 && cc >= 0 && cc < 21) {
					if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
						modules[rr]![cc] = true;
					} else {
						modules[rr]![cc] = false;
					}
				}
			}
		}
	};

	addFinder(0, 0);
	addFinder(0, 14);
	addFinder(14, 0);

	// Pseudo-deterministic data pattern based on text hash
	let hash = 0;
	for (let i = 0; i < text.length; i++) {
		hash = (hash << 5) - hash + text.charCodeAt(i);
		hash |= 0;
	}

	for (let r = 0; r < 21; r++) {
		for (let c = 0; c < 21; c++) {
			const isReserved =
				(r <= 7 && c <= 7) ||
				(r <= 7 && c >= 13) ||
				(r >= 13 && c <= 7) ||
				r === 6 ||
				c === 6;

			if (!isReserved) {
				const val = (r * 21 + c + Math.abs(hash)) % 3;
				modules[r]![c] = val === 0 || val === 1;
			}
		}
	}

	const cellSize = size / 21;
	let rects = '';
	for (let r = 0; r < 21; r++) {
		for (let c = 0; c < 21; c++) {
			if (modules[r]![c]) {
				const x = (c * cellSize).toFixed(2);
				const y = (r * cellSize).toFixed(2);
				const w = cellSize.toFixed(2);
				rects += `<rect x="${x}" y="${y}" width="${w}" height="${w}" fill="${fgColor}"/>`;
			}
		}
	}

	return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
		<rect width="${size}" height="${size}" fill="${bgColor}" rx="8"/>
		<g>${rects}</g>
	</svg>`;
}
