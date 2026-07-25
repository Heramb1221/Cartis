/** Leaflet raster theme (themes.js, unchanged shape) */
export interface RasterTheme {
	name: string;
	tileUrl: string;
	tileUrlNoLabels: string;
	background: string;
	textColor: string;
	accent: string;
	overlayBg: string;
	route: string;
	description: string;
}

/** MapLibre procedural vector theme (artistic-themes.js, unchanged shape) */
export interface ArtisticTheme {
	name: string;
	description: string;
	bg: string;
	text: string;
	water: string;
	parks: string;
	road_motorway: string;
	road_primary: string;
	road_secondary: string;
	road_tertiary?: string;
	road_residential?: string;
	road_default: string;
	route: string;
	/** Present on a few themes (e.g. cyber_noir) for background gradient effects */
	gradient_color?: string;
	/** Set for themes loaded via a raw style URL rather than procedural coloring (NEW, Phase 3) */
	styleUrl?: string;
}

/** User-built theme saved via the theme builder, same shape as ArtisticTheme minus name/description requirement at creation time */
export type CustomTheme = ArtisticTheme;

export type CustomThemeMap = Record<string, CustomTheme>;
