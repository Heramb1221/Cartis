import type { Config } from 'tailwindcss';

// Ported as-is from the original project's inline vite.config.js tailwind block.
// Content paths updated for the TS source tree; colors/fonts/spacing untouched.
export default {
	content: ['./index.html', './src/**/*.{ts,js}'],
	theme: {
		extend: {
			colors: {
				background: '#f8f9fa',
				sidebar: '#ffffff',
			},
			fontFamily: {
				sans: ['Outfit', 'sans-serif'],
				serif: ['"Playfair Display"', 'serif'],
				mono: ['"Fira Code"', 'monospace'],
				poster: ['Outfit', 'sans-serif'],
			},
		},
	},
	plugins: [],
} satisfies Config;
