export interface JourneyPreset {
	id: string;
	name: string;
	description: string;
	startCity: string;
	startCountry: string;
	startLat: number;
	startLon: number;
	endCity: string;
	endCountry: string;
	endLat: number;
	endLon: number;
	travelMode: 'driving' | 'flight' | 'train' | 'walking' | 'cycling' | 'direct';
	theme: string;
	artisticTheme: string;
	renderMode: 'tile' | 'artistic';
	startIcon: 'pin' | 'airplane' | 'car' | 'train' | 'circle' | 'flag' | 'none';
	endIcon: 'pin' | 'airplane' | 'car' | 'train' | 'circle' | 'flag' | 'none';
	routeStyle: 'solid' | 'dashed' | 'dotted' | 'curved-arc';
	routeColor: string;
}

export const FAMOUS_JOURNEYS: JourneyPreset[] = [
	{
		id: 'route_66',
		name: 'Route 66 (USA)',
		description: 'The Main Street of America from Chicago to Santa Monica Beach.',
		startCity: 'CHICAGO',
		startCountry: 'UNITED STATES',
		startLat: 41.8781,
		startLon: -87.6298,
		endCity: 'SANTA MONICA',
		endCountry: 'UNITED STATES',
		endLat: 34.0195,
		endLon: -118.4912,
		travelMode: 'driving',
		theme: 'copper',
		artisticTheme: 'golden_era',
		renderMode: 'artistic',
		startIcon: 'car',
		endIcon: 'flag',
		routeStyle: 'solid',
		routeColor: '#E65100',
	},
	{
		id: 'tokyo_paris',
		name: 'Tokyo ✈ Paris Transcontinental',
		description: 'Intercontinental flight across Asia and Europe.',
		startCity: 'TOKYO',
		startCountry: 'JAPAN',
		startLat: 35.6762,
		startLon: 139.6503,
		endCity: 'PARIS',
		endCountry: 'FRANCE',
		endLat: 48.8566,
		endLon: 2.3522,
		travelMode: 'flight',
		theme: 'dark',
		artisticTheme: 'cyber_noir',
		renderMode: 'artistic',
		startIcon: 'airplane',
		endIcon: 'airplane',
		routeStyle: 'curved-arc',
		routeColor: '#00E5FF',
	},
	{
		id: 'pch_california',
		name: 'Pacific Coast Highway',
		description: 'Scenic California coastal drive along Highway 1.',
		startCity: 'SAN FRANCISCO',
		startCountry: 'UNITED STATES',
		startLat: 37.7749,
		startLon: -122.4194,
		endCity: 'SAN DIEGO',
		endCountry: 'UNITED STATES',
		endLat: 32.7157,
		endLon: -117.1611,
		travelMode: 'driving',
		theme: 'ocean',
		artisticTheme: 'mangrove_maze',
		renderMode: 'artistic',
		startIcon: 'car',
		endIcon: 'flag',
		routeStyle: 'solid',
		routeColor: '#0288D1',
	},
	{
		id: 'trans_siberian',
		name: 'Trans-Siberian Express',
		description: 'The world’s longest railway line from Moscow to Vladivostok.',
		startCity: 'MOSCOW',
		startCountry: 'RUSSIA',
		startLat: 55.7558,
		startLon: 37.6173,
		endCity: 'VLADIVOSTOK',
		endCountry: 'RUSSIA',
		endLat: 43.1155,
		endLon: 131.8855,
		travelMode: 'train',
		theme: 'contrast',
		artisticTheme: 'cyber_noir',
		renderMode: 'artistic',
		startIcon: 'train',
		endIcon: 'train',
		routeStyle: 'dashed',
		routeColor: '#FF5252',
	},
	{
		id: 'camino_santiago',
		name: 'Camino de Santiago',
		description: 'Historic pilgrimage walk across northern Spain.',
		startCity: 'SAINT-JEAN-PIED-DE-PORT',
		startCountry: 'FRANCE',
		startLat: 43.1636,
		startLon: -1.2358,
		endCity: 'SANTIAGO DE COMPOSTELA',
		endCountry: 'SPAIN',
		endLat: 42.8782,
		endLon: -8.5448,
		travelMode: 'walking',
		theme: 'minimal',
		artisticTheme: 'golden_era',
		renderMode: 'artistic',
		startIcon: 'circle',
		endIcon: 'flag',
		routeStyle: 'solid',
		routeColor: '#43A047',
	},
];
