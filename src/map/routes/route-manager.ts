import L from 'leaflet';
import maplibregl from 'maplibre-gl';
import { state, updateState, getSelectedTheme, getSelectedArtisticTheme } from '../../core/store';
import { findBestInsertIndex } from '../../core/utils';
import { fetchOSRMRoute, calculateRouteStats } from './routing';
import { getMap, getArtisticMap } from '../map-init';
import type { CartisState } from '../../types/state';

/** Leaflet doesn't type custom properties we attach for bookkeeping — this local extension keeps that one cast contained. */
interface RouteLine extends L.Polyline {
	_visibleLine?: L.Polyline;
}

let routeStartMarker: L.Marker | null = null;
let routeEndMarker: L.Marker | null = null;
let routeLine: RouteLine | null = null;
let routeLineCasing: L.Polyline | null = null;
let ghostMarker: L.Marker | null = null;
let viaMarkers: L.Marker[] = [];
let artisticViaMarkers: maplibregl.Marker[] = [];
let artisticRouteStartMarker: maplibregl.Marker | null = null;
let artisticRouteEndMarker: maplibregl.Marker | null = null;
let isSyncing = false;

export function getRouteIconHtml(type: string | undefined, label: string): string {
	if (type === 'airplane') {
		return `<div class="w-8 h-8 bg-slate-900 text-white rounded-full shadow-lg flex items-center justify-center ring-2 ring-white/80"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg></div>`;
	}
	if (type === 'car') {
		return `<div class="w-8 h-8 bg-slate-900 text-white rounded-full shadow-lg flex items-center justify-center ring-2 ring-white/80"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg></div>`;
	}
	if (type === 'train') {
		return `<div class="w-8 h-8 bg-slate-900 text-white rounded-full shadow-lg flex items-center justify-center ring-2 ring-white/80"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2c-4.42 0-8 .5-8 4v10.5C4 18.43 5.57 20 7.5 20l-1.5 1.5v.5h12v-.5L16.5 20c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zm0 2c3.71 0 5.13.4 5.8 1H6.2c.67-.6 2.09-1 5.8-1zm-6 7V7h12v4H6zm2 5.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm8 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg></div>`;
	}
	if (type === 'flag') {
		return `<div class="w-8 h-8 bg-emerald-600 text-white rounded-full shadow-lg flex items-center justify-center ring-2 ring-white/80"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg></div>`;
	}
	if (type === 'circle') {
		return `<div class="w-6 h-6 bg-red-500 border-2 border-white rounded-full shadow-md flex items-center justify-center text-[10px] font-black text-white"></div>`;
	}
	if (type === 'none') {
		return `<div class="w-0 h-0 hidden"></div>`;
	}
	return `<div class="w-6 h-6 bg-white border-2 border-slate-900 rounded-full shadow-lg flex items-center justify-center text-[10px] font-black text-slate-900 ring-2 ring-white/50">${label}</div>`;
}

export function fitMapToRoute(): void {
	const map = getMap();
	const artisticMap = getArtisticMap();

	const points: [number, number][] = [
		[state.routeStartLat, state.routeStartLon],
		...(state.routeViaPoints || []).map((p): [number, number] => [p.lat, p.lon]),
		[state.routeEndLat, state.routeEndLon],
	];

	if (points.length === 0) return;

	let minLat = 90;
	let maxLat = -90;
	let minLon = 180;
	let maxLon = -180;

	points.forEach(([lat, lon]) => {
		if (lat < minLat) minLat = lat;
		if (lat > maxLat) maxLat = lat;
		if (lon < minLon) minLon = lon;
		if (lon > maxLon) maxLon = lon;
	});

	if (state.routeGeometry && state.routeGeometry.length > 0) {
		state.routeGeometry.forEach(([lon, lat]) => {
			if (lat < minLat) minLat = lat;
			if (lat > maxLat) maxLat = lat;
			if (lon < minLon) minLon = lon;
			if (lon > maxLon) maxLon = lon;
		});
	}

	const centerLat = (minLat + maxLat) / 2;
	const centerLon = (minLon + maxLon) / 2;

	updateState({ lat: centerLat, lon: centerLon });

	if (map) {
		map.fitBounds(
			[
				[minLat, minLon],
				[maxLat, maxLon],
			],
			{ padding: [50, 50], animate: true }
		);
	}

	if (artisticMap) {
		artisticMap.fitBounds(
			[
				[minLon, minLat],
				[maxLon, maxLat],
			],
			{ padding: 50, animate: true }
		);
	}
}

export async function updateRouteGeometry(): Promise<void> {
	const points: [number, number][] = [
		[state.routeStartLat, state.routeStartLon],
		...(state.routeViaPoints || []).map((p): [number, number] => [p.lat, p.lon]),
		[state.routeEndLat, state.routeEndLon],
	];
	const coords = await fetchOSRMRoute(points, state.travelMode || 'driving');
	const stats = calculateRouteStats(coords);
	updateState({
		routeGeometry: coords,
		routeDistanceKm: stats.km,
		routeDistanceMiles: stats.miles,
	});
	syncRouteMarkers();
}

export function insertViaPoint(lat: number, lon: number): void {
	const via = [...(state.routeViaPoints || [])];
	const routePoints = [{ lat: state.routeStartLat, lon: state.routeStartLon }, ...via, { lat: state.routeEndLat, lon: state.routeEndLon }];
	const index = findBestInsertIndex(lat, lon, routePoints);

	via.splice(index, 0, { lat, lon });

	updateState({ routeViaPoints: via });
	updateRouteGeometry();
}

export function updateRouteStyles(currentState: CartisState): void {
	const map = getMap();
	const artisticMap = getArtisticMap();

	if (!map) return;

	const isArtistic = currentState.renderMode === 'artistic';
	const theme = isArtistic ? getSelectedArtisticTheme() : getSelectedTheme();
	const color = theme.route || '#EF4444';
	const casingColor = isArtistic ? (theme as { bg?: string }).bg || '#ffffff' : (theme as { background?: string }).background || '#ffffff';

	if (currentState.showRoute) {
		const start: [number, number] = [currentState.routeStartLat, currentState.routeStartLon];
		const end: [number, number] = [currentState.routeEndLat, currentState.routeEndLon];

		const startIconHtml = getRouteIconHtml(currentState.routeStartIcon, 'A');
		const endIconHtml = getRouteIconHtml(currentState.routeEndIcon, 'B');

		if (!routeStartMarker) {
			routeStartMarker = L.marker(start, {
				draggable: true,
				icon: L.divIcon({
					className: 'route-marker-a',
					html: startIconHtml,
					iconSize: [28, 28],
					iconAnchor: [14, 14],
				}),
			}).addTo(map);
			routeStartMarker.on('drag', () => {
				if (isSyncing) return;
				isSyncing = true;
				const pos = routeStartMarker!.getLatLng();
				updateState({ routeStartLat: pos.lat, routeStartLon: pos.lng });
				syncRouteMarkers(false);
				isSyncing = false;
			});
			routeStartMarker.on('dragend', updateRouteGeometry);
		} else {
			if (!isSyncing) {
				routeStartMarker.setLatLng(start).setIcon(
					L.divIcon({
						className: 'route-marker-a',
						html: startIconHtml,
						iconSize: [28, 28],
						iconAnchor: [14, 14],
					})
				).addTo(map);
			}
		}

		if (!routeEndMarker) {
			routeEndMarker = L.marker(end, {
				draggable: true,
				icon: L.divIcon({
					className: 'route-marker-b',
					html: endIconHtml,
					iconSize: [28, 28],
					iconAnchor: [14, 14],
				}),
			}).addTo(map);
			routeEndMarker.on('drag', () => {
				if (isSyncing) return;
				isSyncing = true;
				const pos = routeEndMarker!.getLatLng();
				updateState({ routeEndLat: pos.lat, routeEndLon: pos.lng });
				syncRouteMarkers(false);
				isSyncing = false;
			});
			routeEndMarker.on('dragend', updateRouteGeometry);
		} else {
			if (!isSyncing) {
				routeEndMarker.setLatLng(end).setIcon(
					L.divIcon({
						className: 'route-marker-b',
						html: endIconHtml,
						iconSize: [28, 28],
						iconAnchor: [14, 14],
					})
				).addTo(map);
			}
		}

		const via = currentState.routeViaPoints || [];
		const routeCoords: [number, number][] =
			currentState.routeGeometry && currentState.routeGeometry.length > 0
				? currentState.routeGeometry.map((c): [number, number] => [c[1]!, c[0]!])
				: [start, ...via.map((p): [number, number] => [p.lat, p.lon]), end];

		const routeStyle = currentState.routeStyle || (currentState.travelMode === 'flight' ? 'dashed' : 'solid');
		let dashArray: string | undefined = undefined;
		if (routeStyle === 'dashed') dashArray = '8, 8';
		if (routeStyle === 'dotted') dashArray = '3, 6';
		if (routeStyle === 'curved-arc') dashArray = '12, 6';

		const strokeWidth = currentState.routeWidth || 4;
		const showGlow = currentState.routeGlow !== false;

		if (!routeLineCasing) {
			routeLineCasing = L.polyline(routeCoords, { color: casingColor, weight: strokeWidth + 5, opacity: showGlow ? 0.9 : 0, lineCap: 'round' }).addTo(map);
		} else {
			if (!isSyncing) routeLineCasing.setLatLngs(routeCoords).setStyle({ color: casingColor, weight: strokeWidth + 5, opacity: showGlow ? 0.9 : 0 }).addTo(map);
		}

		if (!routeLine) {
			routeLine = L.polyline(routeCoords, {
				color: color,
				weight: 20,
				opacity: 0,
				interactive: true,
			}).addTo(map) as RouteLine;

			const visibleLine = L.polyline(routeCoords, {
				color: color,
				weight: strokeWidth,
				dashArray: dashArray,
				opacity: 1.0,
				lineCap: 'round',
				interactive: false,
			}).addTo(map);

			routeLine._visibleLine = visibleLine;

			routeLine.on('mouseover', () => {
				if (isSyncing) return;
				if (!ghostMarker) {
					ghostMarker = L.marker([0, 0], {
						interactive: false,
						icon: L.divIcon({
							className: 'ghost-point',
							html: `<div class="w-3 h-3 bg-white/90 border-2 border-slate-400 rounded-full shadow-sm scale-90"></div>`,
							iconSize: [12, 12],
							iconAnchor: [6, 6],
						}),
					}).addTo(map);
				}
				const el = ghostMarker.getElement();
				if (el) el.style.display = 'block';
			});

			routeLine.on('mousemove', (e) => {
				if (isSyncing) return;
				if (ghostMarker) {
					ghostMarker.setLatLng(e.latlng);
					const el = ghostMarker.getElement();
					if (el && el.style.display === 'none') el.style.display = 'block';
				}
			});

			routeLine.on('mouseout', () => {
				if (ghostMarker) {
					const el = ghostMarker.getElement();
					if (el) el.style.display = 'none';
				}
			});

			routeLine.on('mousedown', (e) => {
				L.DomEvent.stopPropagation(e);
				const startPos = e.containerPoint;
				let pointAdded = false;
				let index = -1;

				if (ghostMarker) {
					const el = ghostMarker.getElement();
					if (el) el.style.display = 'none';
				}

				isSyncing = true;
				map.dragging.disable();

				const onMouseMove = (me: L.LeafletMouseEvent) => {
					const currentPos = me.containerPoint;
					const dist = startPos.distanceTo(currentPos);

					if (!pointAdded && dist > 5) {
						const via = [...(state.routeViaPoints || [])];
						const routePoints = [
							{ lat: state.routeStartLat, lon: state.routeStartLon },
							...via,
							{ lat: state.routeEndLat, lon: state.routeEndLon },
						];
						index = findBestInsertIndex(me.latlng.lat, me.latlng.lng, routePoints);
						via.splice(index, 0, { lat: me.latlng.lat, lon: me.latlng.lng });
						updateState({ routeViaPoints: via });
						pointAdded = true;
					}

					if (pointAdded && index !== -1) {
						const v = [...state.routeViaPoints];
						v[index] = { lat: me.latlng.lat, lon: me.latlng.lng };
						updateState({ routeViaPoints: v });
						syncRouteMarkers(false);
					}
				};

				const onMouseUp = () => {
					map.off('mousemove', onMouseMove);
					map.off('mouseup', onMouseUp);
					map.dragging.enable();
					isSyncing = false;
					if (pointAdded) {
						updateRouteGeometry();
					}
				};

				map.on('mousemove', onMouseMove);
				map.on('mouseup', onMouseUp);
			});
		} else {
			if (!isSyncing) {
				routeLine.setLatLngs(routeCoords).addTo(map);
				if (routeLine._visibleLine) {
					routeLine._visibleLine.setLatLngs(routeCoords).setStyle({ color: color, weight: strokeWidth, dashArray: dashArray }).addTo(map);
				}
			}
		}

		const currentViaData = currentState.routeViaPoints || [];

		const handleViaDrag = (idx: number, newLatLng: L.LatLng) => {
			if (isSyncing) return;
			isSyncing = true;
			const v = [...(state.routeViaPoints || [])];
			v[idx] = { lat: newLatLng.lat, lon: newLatLng.lng };
			updateState({ routeViaPoints: v });
			syncRouteMarkers(false);
			isSyncing = false;
		};

		if (viaMarkers.length !== currentViaData.length) {
			viaMarkers.forEach((m) => m.remove());
			viaMarkers = [];
			currentViaData.forEach((p, idx) => {
				const dm = L.marker([p.lat, p.lon], {
					draggable: true,
					icon: L.divIcon({
						className: 'via-point',
						html: `<div class="w-3.5 h-3.5 bg-white border-2 border-slate-700 rounded-full shadow-sm hover:scale-125 transition-transform cursor-grab"></div>`,
						iconSize: [14, 14],
						iconAnchor: [7, 7],
					}),
				}).addTo(map);

				dm.on('drag', (e) => handleViaDrag(idx, (e.target as L.Marker).getLatLng()));
				dm.on('dragend', () => {
					isSyncing = false;
					updateRouteGeometry();
				});
				dm.on('dblclick', (e) => {
					L.DomEvent.stopPropagation(e);
					const v = [...state.routeViaPoints];
					v.splice(idx, 1);
					updateState({ routeViaPoints: v });
					updateRouteGeometry();
				});
				viaMarkers.push(dm);
			});
		} else {
			if (!isSyncing) {
				viaMarkers.forEach((m, idx) => {
					const p = currentViaData[idx]!;
					m.setLatLng([p.lat, p.lon]);
				});
			}
		}

		if (artisticMap) {
			if (artisticViaMarkers.length !== currentViaData.length) {
				artisticViaMarkers.forEach((m) => m.remove());
				artisticViaMarkers = currentViaData.map((p, idx) => {
					const el = document.createElement('div');
					el.className = 'artistic-via-point';
					el.style.width = '24px';
					el.style.height = '24px';
					el.style.display = 'flex';
					el.style.alignItems = 'center';
					el.style.justifyContent = 'center';
					el.style.zIndex = '990';
					el.innerHTML = `<div style="width: 12px; height: 12px; background: white; border: 2px solid #333; border-radius: 50%; box-shadow: 0 0 4px rgba(0,0,0,0.4); cursor: grab;"></div>`;

					const am = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([p.lon, p.lat]).addTo(artisticMap!);

					am.on('drag', () => {
						if (isSyncing) return;
						isSyncing = true;
						const pos = am.getLngLat();
						const v = [...state.routeViaPoints];
						v[idx] = { lat: pos.lat, lon: pos.lng };
						updateState({ routeViaPoints: v });
						syncRouteMarkers(false);
						isSyncing = false;
					});

					am.on('dragend', updateRouteGeometry);

					el.addEventListener('dblclick', (e) => {
						e.preventDefault();
						e.stopPropagation();
						const v = [...state.routeViaPoints];
						v.splice(idx, 1);
						updateState({ routeViaPoints: v });
						updateRouteGeometry();
					});

					return am;
				});
			} else {
				if (!isSyncing) {
					artisticViaMarkers.forEach((m, idx) => {
						const p = currentViaData[idx];
						if (p) m.setLngLat([p.lon, p.lat]);
					});
				}
			}

			if (!artisticRouteStartMarker) {
				const el = document.createElement('div');
				el.className = 'route-marker-a';
				el.style.width = '28px';
				el.style.height = '28px';
				el.style.display = 'flex';
				el.style.alignItems = 'center';
				el.style.justifyContent = 'center';
				el.style.zIndex = '1000';
				el.innerHTML = startIconHtml;
				artisticRouteStartMarker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([start[1], start[0]]).addTo(artisticMap);
				artisticRouteStartMarker.on('drag', () => {
					if (isSyncing) return;
					isSyncing = true;
					const pos = artisticRouteStartMarker!.getLngLat();
					updateState({ routeStartLat: pos.lat, routeStartLon: pos.lng });
					syncRouteMarkers(false);
					isSyncing = false;
				});
				artisticRouteStartMarker.on('dragend', updateRouteGeometry);
			} else {
				const el = artisticRouteStartMarker.getElement();
				if (el) el.innerHTML = startIconHtml;
				if (!isSyncing) artisticRouteStartMarker.setLngLat([start[1], start[0]]).addTo(artisticMap);
			}

			if (!artisticRouteEndMarker) {
				const el = document.createElement('div');
				el.className = 'route-marker-b';
				el.style.width = '28px';
				el.style.height = '28px';
				el.style.display = 'flex';
				el.style.alignItems = 'center';
				el.style.justifyContent = 'center';
				el.style.zIndex = '1000';
				el.innerHTML = endIconHtml;
				artisticRouteEndMarker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([end[1], end[0]]).addTo(artisticMap);
				artisticRouteEndMarker.on('drag', () => {
					if (isSyncing) return;
					isSyncing = true;
					const pos = artisticRouteEndMarker!.getLngLat();
					updateState({ routeEndLat: pos.lat, routeEndLon: pos.lng });
					syncRouteMarkers(false);
					isSyncing = false;
				});
				artisticRouteEndMarker.on('dragend', updateRouteGeometry);
			} else {
				const el = artisticRouteEndMarker.getElement();
				if (el) el.innerHTML = endIconHtml;
				if (!isSyncing) artisticRouteEndMarker.setLngLat([end[1], end[0]]).addTo(artisticMap);
			}

			const source = artisticMap.getSource('route-source') as maplibregl.GeoJSONSource | undefined;
			if (source && !isSyncing) {
				source.setData({
					type: 'Feature',
					properties: {},
					geometry: {
						type: 'LineString',
						coordinates:
							currentState.routeGeometry && currentState.routeGeometry.length > 0
								? currentState.routeGeometry
								: [
										[currentState.routeStartLon, currentState.routeStartLat],
										[currentState.routeEndLon, currentState.routeEndLat],
									],
					},
				});
			}
			if (artisticMap.getLayer('route-line')) {
				artisticMap.setLayoutProperty('route-line', 'visibility', 'visible');
				artisticMap.setPaintProperty('route-line', 'line-color', color);
				artisticMap.setPaintProperty('route-line', 'line-width', strokeWidth);
			}
			if (artisticMap.getLayer('route-line-casing')) {
				artisticMap.setLayoutProperty('route-line-casing', 'visibility', showGlow ? 'visible' : 'none');
				artisticMap.setPaintProperty('route-line-casing', 'line-color', (theme as { bg?: string }).bg || '#ffffff');
				artisticMap.setPaintProperty('route-line-casing', 'line-width', strokeWidth + 5);
			}
			if (artisticMap.getLayer('route-line-glow')) {
				artisticMap.setLayoutProperty('route-line-glow', 'visibility', 'visible');
				artisticMap.setPaintProperty('route-line-glow', 'line-color', color);
			}
		}
	} else {
		if (routeStartMarker) {
			routeStartMarker.remove();
			routeStartMarker = null;
		}
		if (routeEndMarker) {
			routeEndMarker.remove();
			routeEndMarker = null;
		}
		if (routeLine) {
			if (routeLine._visibleLine) routeLine._visibleLine.remove();
			routeLine.remove();
			routeLine = null;
		}
		if (routeLineCasing) {
			routeLineCasing.remove();
			routeLineCasing = null;
		}
		if (ghostMarker) {
			ghostMarker.remove();
			ghostMarker = null;
		}
		viaMarkers.forEach((m) => m.remove());
		viaMarkers = [];
		artisticViaMarkers.forEach((m) => m.remove());
		artisticViaMarkers = [];
		if (artisticRouteStartMarker) {
			artisticRouteStartMarker.remove();
			artisticRouteStartMarker = null;
		}
		if (artisticRouteEndMarker) {
			artisticRouteEndMarker.remove();
			artisticRouteEndMarker = null;
		}
		if (artisticMap) {
			if (artisticMap.getLayer('route-line')) artisticMap.setLayoutProperty('route-line', 'visibility', 'none');
			if (artisticMap.getLayer('route-line-casing')) artisticMap.setLayoutProperty('route-line-casing', 'visibility', 'none');
			if (artisticMap.getLayer('route-line-glow')) artisticMap.setLayoutProperty('route-line-glow', 'visibility', 'none');
		}
	}
}

export function syncRouteMarkers(applyGeometry = true): void {
	const artisticMap = getArtisticMap();

	if (routeStartMarker) routeStartMarker.setLatLng([state.routeStartLat, state.routeStartLon]);
	if (routeEndMarker) routeEndMarker.setLatLng([state.routeEndLat, state.routeEndLon]);

	const via = state.routeViaPoints || [];
	const points: [number, number][] = [[state.routeStartLat, state.routeStartLon], ...via.map((p): [number, number] => [p.lat, p.lon]), [state.routeEndLat, state.routeEndLon]];

	const routeCoords: [number, number][] =
		state.routeGeometry && state.routeGeometry.length > 0 && applyGeometry ? state.routeGeometry.map((c): [number, number] => [c[1]!, c[0]!]) : points;

	if (routeLine) {
		routeLine.setLatLngs(routeCoords);
		if (routeLine._visibleLine) routeLine._visibleLine.setLatLngs(routeCoords);
	}
	if (routeLineCasing) routeLineCasing.setLatLngs(routeCoords);

	if (viaMarkers.length === via.length) {
		viaMarkers.forEach((m, i) => m.setLatLng([via[i]!.lat, via[i]!.lon]));
	}

	if (artisticRouteStartMarker) artisticRouteStartMarker.setLngLat([state.routeStartLon, state.routeStartLat]);
	if (artisticRouteEndMarker) artisticRouteEndMarker.setLngLat([state.routeEndLon, state.routeEndLat]);

	if (artisticViaMarkers.length === via.length) {
		artisticViaMarkers.forEach((m, i) => m.setLngLat([via[i]!.lon, via[i]!.lat]));
	}

	if (artisticMap) {
		const source = artisticMap.getSource('route-source') as maplibregl.GeoJSONSource | undefined;
		if (source) {
			const artisticCoords: [number, number][] =
				state.routeGeometry && state.routeGeometry.length > 0 && applyGeometry ? state.routeGeometry : points.map((p): [number, number] => [p[1], p[0]]);

			source.setData({
				type: 'Feature',
				properties: {},
				geometry: {
					type: 'LineString',
					coordinates: artisticCoords,
				},
			});
		}
	}
}
