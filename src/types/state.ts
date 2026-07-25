export type RenderMode = 'tile' | 'artistic';
export type OverlayBgType = 'vignette' | 'radial' | 'transparent';
export type OverlaySize = 'small' | 'medium' | 'large';
export type MarkerIcon = 'pin' | 'circle' | 'heart' | 'star' | 'none';

export interface MarkerPoint {
	lat: number;
	lon: number;
}

/**
 * Full editable poster configuration. This is the ported shape of the
 * original defaultState in core/state.js, unchanged field-for-field,
 * plus new fields for Phase 3+ features (marked NEW). Keeping the
 * original fields untouched means Phase 1 can port state.js to a typed
 * store with zero behavior change before any new feature work starts.
 */
export interface CartisState {
	// --- Location & title text (ported) ---
	city: string;
	cityOverride: string;
	country: string;
	countryOverride: string;
	cityFont: string;
	countryFont: string;
	coordsFont: string;
	lat: number;
	lon: number;
	zoom: number;

	// --- Theme & render mode (ported) ---
	theme: string;
	renderMode: RenderMode;
	artisticTheme: string;
	showLabels: boolean;

	// --- Canvas size (ported) ---
	width: number;
	height: number;
	isExporting: boolean;

	// --- Overlay / typography layout (ported) ---
	overlayBgType: OverlayBgType;
	overlaySize: OverlaySize;
	overlayX: number;
	overlayY: number;
	showCountry: boolean;
	showCoords: boolean;

	// --- Mat / passepartout framing (ported) ---
	matEnabled: boolean;
	matWidth: number;
	matShowBorder: boolean;
	matBorderWidth: number;
	matBorderOpacity: number;

	// --- Markers (ported) ---
	showMarker: boolean;
	markers: MarkerPoint[];
	markerIcon: MarkerIcon;
	markerSize: number;

	// --- Routes & Journey ---
	showRoute: boolean;
	routeStartLat: number;
	routeStartLon: number;
	routeEndLat: number;
	routeEndLon: number;
	routeGeometry: [number, number][];
	routeViaPoints: MarkerPoint[];
	travelMode?: 'driving' | 'flight' | 'train' | 'walking' | 'cycling' | 'direct';
	routeStartCity?: string;
	routeEndCity?: string;
	routeColor?: string;
	routeWidth?: number;
	routeStyle?: 'solid' | 'dashed' | 'dotted' | 'curved-arc';
	routeGlow?: boolean;
	routeStartIcon?: 'pin' | 'airplane' | 'car' | 'train' | 'circle' | 'flag' | 'none';
	routeEndIcon?: 'pin' | 'airplane' | 'car' | 'train' | 'circle' | 'flag' | 'none';
	overlayBadgeStyle?: 'standard' | 'travel_stats' | 'boarding_pass';
	routeDistanceKm?: number;
	routeDistanceMiles?: number;

	// --- NEW: perspective (Phase 5) ---
	pitch?: number;
	bearing?: number;

	// --- NEW: MapLibre-only overlays (Phase 3) ---
	show3dBuildings?: boolean;
	showContours?: boolean;
	showGraticule?: boolean;
	invertWaterLand?: boolean;
	customThemeColors?: Partial<Record<'water' | 'land' | 'roadMotorway' | 'roadPrimary' | 'roadSecondary', string>>;

	// --- NEW: data import & advanced overlays (Phase 4) ---
	showCustomTrack?: boolean;
	customTrackPoints?: [number, number][]; // [lon, lat] pairs, matches routeGeometry's convention
	customTrackColor?: string;
	customTrackWidth?: number;
	customTrackGlow?: boolean;
	customTrackSourceName?: string; // filename or "Drawn path", shown in the UI

	transitEnabled?: boolean;

	heatmapEnabled?: boolean;
	heatmapPoints?: MarkerPoint[];
	heatmapSourceName?: string;

	customPois?: Array<MarkerPoint & { label: string }>;

	// --- NEW: Dual City, Photo Pins, Milestones & QR ---
	dualCityEnabled?: boolean;
	city2?: string;
	country2?: string;
	lat2?: number;
	lon2?: number;
	photoPins?: Array<{ id: string; lat: number; lon: number; dataUrl: string; caption?: string }>;
	tripMilestones?: Array<{ date: string; title: string; location: string }>;
	showQrCode?: boolean;
	qrCodeUrl?: string;

	// --- NEW: print framing (Phase 5) ---
	showPrintBorder?: boolean;
	showBleedGuide?: boolean;
	bleedMm?: number;
	exportDpi?: number;
	showScaleBar?: boolean;
	showCompassRose?: boolean;
}

/**
 * Keys persisted to localStorage. Mirrors the original SAVED_KEYS list;
 * new optional fields get added here as each phase lands, not before,
 * so persistence stays predictable and migration-safe.
 */
export const SAVED_KEYS: readonly (keyof CartisState)[] = [
	'city',
	'cityOverride',
	'country',
	'countryOverride',
	'cityFont',
	'countryFont',
	'coordsFont',
	'lat',
	'lon',
	'zoom',
	'theme',
	'width',
	'height',
	'overlayBgType',
	'overlaySize',
	'showLabels',
	'renderMode',
	'artisticTheme',
	'matEnabled',
	'matWidth',
	'matShowBorder',
	'matBorderWidth',
	'matBorderOpacity',
	'showMarker',
	'markers',
	'markerIcon',
	'markerSize',
	'showRoute',
	'routeStartLat',
	'routeStartLon',
	'routeEndLat',
	'routeEndLon',
	'routeViaPoints',
	'travelMode',
	'routeStartCity',
	'routeEndCity',
	'routeColor',
	'routeWidth',
	'routeStyle',
	'routeGlow',
	'routeStartIcon',
	'routeEndIcon',
	'overlayBadgeStyle',
	'routeDistanceKm',
	'routeDistanceMiles',
	'dualCityEnabled',
	'city2',
	'country2',
	'lat2',
	'lon2',
	'photoPins',
	'tripMilestones',
	'showQrCode',
	'qrCodeUrl',
	'overlayX',
	'overlayY',
	'showCountry',
	'showCoords',
	'show3dBuildings',
	'showContours',
	'showGraticule',
	'invertWaterLand',
	'showCustomTrack',
	'customTrackPoints',
	'customTrackColor',
	'customTrackWidth',
	'customTrackGlow',
	'customTrackSourceName',
	'transitEnabled',
	'heatmapEnabled',
	'customPois',
	'pitch',
	'bearing',
	'showPrintBorder',
	'showBleedGuide',
	'bleedMm',
	'exportDpi',
	'showScaleBar',
	'showCompassRose',
] as const;

export const defaultState: CartisState = {
	city: 'JAKARTA',
	cityOverride: '',
	country: 'INDONESIA',
	countryOverride: '',
	cityFont: "'Playfair Display', serif",
	countryFont: "'Outfit', sans-serif",
	coordsFont: "'Outfit', sans-serif",
	lat: -6.2088,
	lon: 106.8456,
	zoom: 12,
	theme: 'minimal',
	width: 1080,
	height: 1080,
	isExporting: false,
	overlayBgType: 'vignette',
	overlaySize: 'medium',
	showLabels: true,
	renderMode: 'tile',
	artisticTheme: 'cyber_noir',
	matEnabled: false,
	matWidth: 40,
	matShowBorder: true,
	matBorderWidth: 1,
	matBorderOpacity: 1,
	showMarker: false,
	markers: [{ lat: -6.2088, lon: 106.8456 }],
	markerIcon: 'pin',
	markerSize: 1,
	showRoute: false,
	routeStartLat: -6.2088,
	routeStartLon: 106.8456,
	routeEndLat: -6.215,
	routeEndLon: 106.855,
	routeGeometry: [],
	routeViaPoints: [],
	travelMode: 'driving',
	routeStartCity: '',
	routeEndCity: '',
	routeColor: '',
	routeWidth: 4,
	routeStyle: 'solid',
	routeGlow: true,
	routeStartIcon: 'pin',
	routeEndIcon: 'pin',
	overlayBadgeStyle: 'standard',
	routeDistanceKm: 0,
	routeDistanceMiles: 0,
	dualCityEnabled: false,
	city2: 'BALI',
	country2: 'INDONESIA',
	lat2: -8.4095,
	lon2: 115.1889,
	photoPins: [],
	tripMilestones: [],
	showQrCode: false,
	qrCodeUrl: 'https://github.com/Heramb1221/Cartis',
	overlayX: 0.5,
	overlayY: 0.85,
	showCountry: true,
	showCoords: true,
};
