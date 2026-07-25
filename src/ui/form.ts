import { state, updateState, getSelectedTheme, getSelectedArtisticTheme } from '../core/store';
import { defaultState } from '../types/state';
import { hexToRgba } from '../core/utils';
import { artisticThemes } from '../core/themes/artistic-themes';
import { themes } from '../core/themes/raster-themes';
import { outputPresets } from '../core/output-presets';
import {
	loadCustomThemes,
	saveCustomTheme,
	deleteCustomTheme,
	newCustomThemeKey,
	exportCustomThemes,
	importCustomThemesFromJSON,
	clearCustomThemes,
} from '../core/themes/custom-themes';
import { updateMapPosition, invalidateMapSize, updateArtisticStyle, forceRefreshArtisticStyle, updateMapTheme, updateMarkerStyles, updateRouteStyles, updateRouteGeometry, refreshMapLibreOverlays, updateMapTilt, getArtisticMap } from '../map/map-init';
import { fitMapToRoute } from '../map/routes/route-manager';
import { previewThemeField } from '../map/maplibre/theme-builder';
import { parseGPX } from '../map/routes/gpx-import';
import { parseGeoJSONTrack } from '../map/routes/geojson-import';
import { startDrawSession, type DrawSession } from '../map/routes/draw-tool';
import { parseCoordinateFile } from '../core/coordinate-file-import';
import { mmToPx, DEFAULT_EXPORT_DPI, DEFAULT_BLEED_MM } from '../core/units';
import { computeScaleBar } from '../core/scale-bar';
import { searchLocation, formatCoords } from '../map/geocoder';
import { FAMOUS_JOURNEYS } from '../core/journey-presets';
import { generateQrCodeSvg } from '../core/qr-code';
import { addPhotoPin, updatePhotoPinMarkers } from '../map/markers/photo-pins';
import { startJourneyAnimation, stopJourneyAnimation, recordJourneyVideo, isAnimationPlaying } from '../map/routes/journey-animator';
import type { CartisState } from '../types/state';
import type { ArtisticTheme, CustomTheme } from '../types/themes';

/** Small helper to keep every DOM lookup below terse while still typed. */
function el<T extends HTMLElement = HTMLElement>(id: string): T | null {
	return document.getElementById(id) as T | null;
}

export function setupControls(): (currentState: CartisState) => void {
	const searchInput = el<HTMLInputElement>('search-input')!;
	const searchResults = el<HTMLElement>('search-results')!;
	const searchLoading = el('search-loading');
	const latInput = el<HTMLInputElement>('lat-input')!;
	const lonInput = el<HTMLInputElement>('lon-input')!;
	const cityOverrideInput = el<HTMLInputElement>('city-override-input');
	const countryOverrideInput = el<HTMLInputElement>('country-override-input');
	const cityFontSelect = el<HTMLSelectElement>('city-font-select');
	const countryFontSelect = el<HTMLSelectElement>('country-font-select');
	const coordsFontSelect = el<HTMLSelectElement>('coords-font-select');
	const zoomSlider = el<HTMLInputElement>('zoom-slider')!;
	const zoomValue = el('zoom-value')!;

	const modeTile = el<HTMLElement>('mode-tile')!;
	const modeArtistic = el<HTMLElement>('mode-artistic')!;
	const standardThemeConfig = el('standard-theme-config');
	const artisticThemeConfig = el('artistic-theme-config');
	const labelsControl = el('labels-control');

	const themeSelect = el<HTMLSelectElement>('theme-select');
	const artisticMainGrid = el('artistic-main-grid');
	const artisticDesc = el('artistic-desc')!;

	const paletteFor = (t: Partial<ArtisticTheme>): string[] => {
		const candidates = [t.road_motorway, t.road_primary, t.road_secondary, t.road_tertiary, t.text, t.bg];
		return candidates.map((c) => c || '#cccccc').slice(0, 4);
	};

	if (artisticMainGrid) {
		const mainKeys = ['cyber_noir', 'golden_era', 'mangrove_maze'];

		const makeCard = (key: string, theme: Partial<ArtisticTheme>, isOther = false): string => {
			const p = paletteFor(theme);
			const label = theme && theme.name ? theme.name : isOther ? 'Other Theme' : key;
			return `
				<button type="button" data-key="${key}" class="art-card group p-3 rounded-2xl border border-slate-100 bg-slate-50 flex flex-col items-center text-center hover:shadow-xl transition-all">
					<div class="flex items-center justify-center -space-x-2">
						<span class="w-6 h-6 rounded-full ring-1 ring-white" style="background:${p[0]}"></span>
						<span class="w-6 h-6 rounded-full ring-1 ring-white" style="background:${p[1]}"></span>
						<span class="w-6 h-6 rounded-full ring-1 ring-white" style="background:${p[2]}"></span>
						<span class="w-6 h-6 rounded-full ring-1 ring-white" style="background:${p[3]}"></span>
					</div>
					<div class="mt-3 text-[11px] font-semibold text-slate-900">${label}</div>
				</button>
			`;
		};

		const mainHtml = mainKeys.map((k) => makeCard(k, artisticThemes[k] || {})).join('') + makeCard('other', { name: 'Other Theme' }, true);
		artisticMainGrid.innerHTML = mainHtml;

		artisticMainGrid.querySelectorAll<HTMLElement>('.art-card').forEach((btn) => {
			btn.addEventListener('click', () => {
				const k = btn.dataset.key!;
				if (k === 'other') {
					const artModal = el('artistic-modal');
					if (artModal) {
						artModal.classList.add('show');
						populateArtisticModal();
					}
					return;
				}
				updateState({ artisticTheme: k });
				if (state.renderMode === 'artistic') {
					const theme = getSelectedArtisticTheme();
					updateArtisticStyle(theme);
					updateRouteStyles(state);
				}
			});
		});
	}

	if (themeSelect) {
		themeSelect.innerHTML = Object.keys(themes)
			.sort((a, b) => (themes[a]!.name || a).localeCompare(themes[b]!.name || b))
			.map((key) => {
				const t = themes[key]!;
				return `<option value="${key}">${t.name || key}</option>`;
			})
			.join('\n');
	}

	const labelsToggle = el<HTMLInputElement>('show-labels-toggle');
	const show3dBuildingsToggle = el<HTMLInputElement>('show-3d-buildings-toggle');
	const showContoursToggle = el<HTMLInputElement>('show-contours-toggle');
	const showGraticuleToggle = el<HTMLInputElement>('show-graticule-toggle');
	const invertWaterLandToggle = el<HTMLInputElement>('invert-water-land-toggle');
	const markerToggle = el<HTMLInputElement>('show-marker-toggle');
	const routeToggle = el<HTMLInputElement>('show-route-toggle');
	const markerSettings = el('marker-settings');
	const markerIconSelect = el<HTMLSelectElement>('marker-icon-select');
	const markerSizeSlider = el<HTMLInputElement>('marker-size-slider');
	const markerSizeValue = el('marker-size-value');

	const overlayBgButtons = document.querySelectorAll<HTMLElement>('.overlay-bg-btn');
	const overlaySizeButtons = document.querySelectorAll<HTMLElement>('.overlay-size-btn');
	const overlaySizeGroup = el('overlay-size-group');
	const customW = el<HTMLInputElement>('custom-w');
	const customH = el<HTMLInputElement>('custom-h');
	const presetBtns = document.querySelectorAll<HTMLElement>('.preset-btn');
	const exportBtn = el('export-btn')!;

	const matToggle = el<HTMLInputElement>('mat-toggle');
	const matSettings = el('mat-settings');
	const matWidthSlider = el<HTMLInputElement>('mat-width-slider');
	const matWidthValue = el('mat-width-value');
	const matBorderToggle = el<HTMLInputElement>('mat-border-toggle');
	const matBorderSettings = el('mat-border-settings');
	const matBorderWidthSlider = el<HTMLInputElement>('mat-border-width-slider');
	const matBorderWidthValue = el('mat-border-width-value');
	const matBorderOpacitySlider = el<HTMLInputElement>('mat-border-opacity-slider');
	const matBorderOpacityValue = el('mat-border-opacity-value');

	matToggle?.addEventListener('change', (e) => {
		updateState({ matEnabled: (e.target as HTMLInputElement).checked });
	});

	matWidthSlider?.addEventListener('input', (e) => {
		updateState({ matWidth: parseInt((e.target as HTMLInputElement).value) });
	});

	matBorderToggle?.addEventListener('change', (e) => {
		updateState({ matShowBorder: (e.target as HTMLInputElement).checked });
	});

	matBorderWidthSlider?.addEventListener('input', (e) => {
		updateState({ matBorderWidth: parseInt((e.target as HTMLInputElement).value) });
	});

	matBorderOpacitySlider?.addEventListener('input', (e) => {
		updateState({ matBorderOpacity: parseFloat((e.target as HTMLInputElement).value) });
	});

	markerIconSelect?.addEventListener('change', (e) => {
		updateState({ markerIcon: (e.target as HTMLSelectElement).value as CartisState['markerIcon'] });
		updateMarkerStyles(state);
	});

	markerSizeSlider?.addEventListener('input', (e) => {
		const size = parseInt((e.target as HTMLInputElement).value);
		updateState({ markerSize: size / 40.0 });
		updateMarkerStyles(state);
		if (markerSizeValue) markerSizeValue.textContent = `${size}px`;
	});

	const logoBtn = el('logo-btn');
	const creditsModal = el('credits-modal');
	const closeCredits = el('close-credits');
	const creditsOverlay = el('credits-overlay');

	logoBtn?.addEventListener('click', () => {
		creditsModal?.classList.add('show');
	});

	[closeCredits, creditsOverlay].forEach((element) => {
		element?.addEventListener('click', () => {
			creditsModal?.classList.remove('show');
		});
	});

	const otherPresetsBtn = el('other-presets-btn');
	const presetsModal = el('presets-modal');
	const closeModal = el('close-modal');
	const closeModalBtn = el('close-modal-btn');
	const modalContent = el('modal-content');
	const modalOverlay = el('modal-overlay');

	otherPresetsBtn?.addEventListener('click', () => {
		presetsModal?.classList.add('show');
		populateModal();
	});

	[closeModal, closeModalBtn, modalOverlay].forEach((element) => {
		element?.addEventListener('click', () => {
			presetsModal?.classList.remove('show');
		});
	});

	const artisticModal = el('artistic-modal');
	const artisticModalContent = el('artistic-modal-content');
	const closeArtisticModal = el('close-artistic-modal');
	const closeArtisticModalBtn = el('close-artistic-modal-btn');
	const artisticModalOverlay = el('artistic-modal-overlay');

	[closeArtisticModal, closeArtisticModalBtn, artisticModalOverlay].forEach((element) => {
		element?.addEventListener('click', () => {
			artisticModal?.classList.remove('show');
		});
	});

	const ctModal = el('custom-theme-modal')!;
	const ctModalTitle = el('custom-theme-modal-title')!;
	const ctSaveBtn = el('custom-theme-save-btn');
	const ctDeleteBtn = el('custom-theme-delete-btn')!;
	const ctCancelBtn = el('custom-theme-cancel-btn');
	const ctCloseBtn = el('close-custom-theme-modal');
	const ctOverlay = el('custom-theme-modal-overlay');

	const CT_FIELDS: { id: string; key: keyof Omit<CustomTheme, 'name' | 'description'> }[] = [
		{ id: 'ct-bg', key: 'bg' },
		{ id: 'ct-text', key: 'text' },
		{ id: 'ct-water', key: 'water' },
		{ id: 'ct-parks', key: 'parks' },
		{ id: 'ct-road-motorway', key: 'road_motorway' },
		{ id: 'ct-road-primary', key: 'road_primary' },
		{ id: 'ct-road-secondary', key: 'road_secondary' },
		{ id: 'ct-road-tertiary', key: 'road_tertiary' },
		{ id: 'ct-road-residential', key: 'road_residential' },
		{ id: 'ct-road-default', key: 'road_default' },
		{ id: 'ct-route', key: 'route' },
	];

	CT_FIELDS.forEach(({ id, key: fieldKey }) => {
		const picker = el<HTMLInputElement>(id);
		const hex = el<HTMLInputElement>(id + '-hex');
		if (!picker || !hex) return;
		picker.addEventListener('input', () => {
			hex.value = picker.value;
			if (state.renderMode === 'artistic') previewThemeField(getArtisticMap(), fieldKey, picker.value);
		});
		hex.addEventListener('input', () => {
			if (/^#[0-9a-fA-F]{6}$/.test(hex.value.trim())) {
				picker.value = hex.value.trim();
				if (state.renderMode === 'artistic') previewThemeField(getArtisticMap(), fieldKey, picker.value);
			}
		});
	});

	let _editingCustomKey: string | null = null;

	function openCustomThemeEditor(key: string | null = null): void {
		_editingCustomKey = key;
		ctModalTitle.textContent = key ? 'Edit Custom Theme' : 'Create Custom Theme';
		ctDeleteBtn.classList.toggle('hidden', !key);

		const existing: Partial<CustomTheme> = key ? loadCustomThemes()[key] || {} : {};
		el<HTMLInputElement>('ct-name')!.value = existing.name || '';
		el<HTMLInputElement>('ct-desc')!.value = existing.description || '';
		CT_FIELDS.forEach(({ id, key: fieldKey }) => {
			const picker = el<HTMLInputElement>(id);
			const hexEl = el<HTMLInputElement>(id + '-hex');
			const val = existing[fieldKey] || picker?.defaultValue || '#000000';
			if (picker) picker.value = val;
			if (hexEl) hexEl.value = val;
		});
		ctModal.classList.add('show');
	}

	function closeCustomThemeEditor(): void {
		ctModal.classList.remove('show');
		_editingCustomKey = null;
		if (state.renderMode === 'artistic') {
			forceRefreshArtisticStyle(getSelectedArtisticTheme());
		}
		populateArtisticModal();
		artisticModal?.classList.add('show');
	}

	[ctCancelBtn, ctCloseBtn, ctOverlay].forEach((element) => {
		element?.addEventListener('click', closeCustomThemeEditor);
	});

	ctSaveBtn?.addEventListener('click', () => {
		const name = (el<HTMLInputElement>('ct-name')!.value || '').trim();
		if (!name) {
			el<HTMLInputElement>('ct-name')!.focus();
			return;
		}

		const theme = { name, description: (el<HTMLInputElement>('ct-desc')!.value || '').trim() } as CustomTheme;
		CT_FIELDS.forEach(({ id, key: fieldKey }) => {
			(theme as unknown as Record<string, string>)[fieldKey] = el<HTMLInputElement>(id)?.value || '#000000';
		});

		const key = _editingCustomKey || newCustomThemeKey();
		saveCustomTheme(key, theme);
		updateState({ artisticTheme: key });
		if (state.renderMode === 'artistic') updateArtisticStyle(getSelectedArtisticTheme());
		closeCustomThemeEditor();
	});

	ctDeleteBtn.addEventListener('click', () => {
		if (!_editingCustomKey) return;
		const name = el<HTMLInputElement>('ct-name')!.value || _editingCustomKey;
		if (!confirm(`Delete "${name}"?`)) return;
		deleteCustomTheme(_editingCustomKey);
		if (state.artisticTheme === _editingCustomKey) {
			updateState({ artisticTheme: 'cyber_noir' });
			if (state.renderMode === 'artistic') updateArtisticStyle(getSelectedArtisticTheme());
		}
		closeCustomThemeEditor();
	});

	function populateArtisticModal(): void {
		if (!artisticModalContent) return;

		const customThemes = loadCustomThemes();
		const customKeys = Object.keys(customThemes);
		const mainKeys = new Set(['cyber_noir', 'golden_era', 'mangrove_maze']);

		const makeSwatches = (t: Partial<ArtisticTheme>): string => {
			const cols = [t.road_motorway, t.road_primary, t.road_secondary, t.road_tertiary, t.text, t.bg];
			return cols
				.map((c) => c || '#cccccc')
				.slice(0, 4)
				.map((c) => `<span class="w-6 h-6 rounded-full ring-1 ring-white shrink-0" style="background:${c}"></span>`)
				.join('');
		};

		const customSection = customKeys.length
			? `
			<div class="space-y-2 pb-4 border-b border-slate-100">
				<div class="flex items-center justify-between">
					<p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">My Themes</p>
					<div class="flex items-center gap-2">
						<button id="export-custom-themes-btn" class="text-[10px] font-bold text-slate-400 hover:text-accent transition-colors flex items-center gap-1" title="Export all custom themes as JSON">
							<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
							Export
						</button>
						<button id="delete-all-custom-themes-btn" class="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1" title="Delete all custom themes">
							<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
							Delete All
						</button>
					</div>
				</div>
				${customKeys
					.map((key) => {
						const t = customThemes[key]!;
						return `
					<div class="flex items-center gap-2 p-3 border border-slate-100 rounded-2xl hover:shadow-md transition-all" data-search-row>
						<button class="artistic-modal-item flex-1 flex items-center gap-3 text-left" data-key="${key}">
							<div class="flex -space-x-2">${makeSwatches(t)}</div>
							<div>
								<div class="text-sm font-semibold text-slate-900">${t.name || key}</div>
								<div class="text-[10px] text-slate-400 mt-0.5">${t.description || 'Custom theme'}</div>
							</div>
						</button>
						<button class="edit-custom-btn shrink-0 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors" data-key="${key}" title="Edit">
							<svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
						</button>
					</div>`;
					})
					.join('')}
			</div>`
			: '';

		const builtinHtml = Object.entries(artisticThemes)
			.filter(([k]) => !mainKeys.has(k))
			.map(
				([key, t]) => `
				<button class="artistic-modal-item group w-full flex items-center p-4 border border-slate-100 rounded-2xl hover:shadow-xl transition-all" data-key="${key}" data-search-row>
					<div class="flex -space-x-2 mr-4">${makeSwatches(t)}</div>
					<div class="text-left">
						<div class="text-sm font-semibold text-slate-900">${t.name || key}</div>
						<div class="text-[10px] text-slate-400 mt-1">${t.description || ''}</div>
					</div>
				</button>`,
			)
			.join('');

		artisticModalContent.innerHTML = `
			<div class="flex gap-2">
				<button id="create-custom-theme-btn" class="flex-1 flex items-center gap-2 p-3.5 border-2 border-dashed border-slate-200 rounded-2xl hover:border-accent hover:bg-accent/5 transition-all text-slate-400 hover:text-accent">
					<svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
					<span class="text-xs font-semibold">Create Theme</span>
				</button>
				<button id="import-custom-themes-btn" class="flex items-center gap-2 px-4 py-3.5 border-2 border-dashed border-slate-200 rounded-2xl hover:border-accent hover:bg-accent/5 transition-all text-slate-400 hover:text-accent" title="Import themes from JSON file">
					<svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12"/></svg>
					<span class="text-xs font-semibold">Import</span>
				</button>
			</div>
			<input type="file" id="import-custom-themes-file" accept=".json,application/json" class="hidden" />
			${customSection}
			<div class="mb-2">
				<input id="artistic-search" type="search" placeholder="Search themes..." class="w-full input-field" />
			</div>
			<div class="space-y-2">${builtinHtml}</div>
		`;

		el('create-custom-theme-btn')?.addEventListener('click', () => {
			artisticModal?.classList.remove('show');
			openCustomThemeEditor(null);
		});

		el('import-custom-themes-btn')?.addEventListener('click', () => {
			el('import-custom-themes-file')?.click();
		});
		el<HTMLInputElement>('import-custom-themes-file')?.addEventListener('change', (e) => {
			const input = e.target as HTMLInputElement;
			const file = input.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = (ev) => {
				try {
					const { imported, skipped } = importCustomThemesFromJSON(ev.target!.result as string);
					populateArtisticModal();
					alert(`Imported ${imported} theme${imported !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped — invalid)` : ''}.`);
				} catch {
					alert('Could not read file. Make sure it is a valid JSON export from this app.');
				}
				input.value = '';
			};
			reader.readAsText(file);
		});

		el('export-custom-themes-btn')?.addEventListener('click', exportCustomThemes);

		el('delete-all-custom-themes-btn')?.addEventListener('click', () => {
			if (!confirm(`Delete all ${customKeys.length} custom theme${customKeys.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
			clearCustomThemes();
			if (customKeys.includes(state.artisticTheme)) updateState({ artisticTheme: 'cyber_noir' });
			populateArtisticModal();
		});

		artisticModalContent.querySelectorAll<HTMLElement>('.edit-custom-btn').forEach((btn) => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				artisticModal?.classList.remove('show');
				openCustomThemeEditor(btn.dataset.key!);
			});
		});

		artisticModalContent.querySelectorAll<HTMLElement>('.artistic-modal-item').forEach((btn) => {
			btn.addEventListener('click', () => {
				const k = btn.dataset.key!;
				updateState({ artisticTheme: k });
				if (state.renderMode === 'artistic') {
					updateArtisticStyle(getSelectedArtisticTheme());
					updateRouteStyles(state);
				}
				artisticModal?.classList.remove('show');
			});
		});

		const artSearch = el<HTMLInputElement>('artistic-search');
		let artSearchTimeout: ReturnType<typeof setTimeout>;
		artSearch?.addEventListener('input', (e) => {
			clearTimeout(artSearchTimeout);
			const q = ((e.target as HTMLInputElement).value || '').trim().toLowerCase();
			artSearchTimeout = setTimeout(() => {
				artisticModalContent.querySelectorAll<HTMLElement>('[data-search-row]').forEach((it) => {
					const txt = (it.innerText || '').toLowerCase();
					it.style.display = q ? (txt.includes(q) ? '' : 'none') : '';
				});
			}, 120);
		});
	}

	function populateModal(): void {
		if (!modalContent) return;
		const groupsHtml = Object.entries(outputPresets)
			.filter(([, presets]) => Array.isArray(presets) && presets.length > 0)
			.map(
				([key, presets]) => `
			<div class="space-y-4 preset-group">
        <div class="flex items-center space-x-3">
          <div class="w-1 h-5 bg-accent rounded-full"></div>
          <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">${key.replace('_', ' ')}</h3>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          ${presets
				.map((p) => {
					const isActive = state.width === p.width && state.height === p.height;
					return `
              <button class="modal-preset-btn group flex flex-col items-start p-4 border ${isActive ? 'border-accent bg-accent-light' : 'border-slate-100 bg-slate-50/50'} rounded-2xl hover:border-accent hover:bg-white hover:shadow-xl transition-all text-left" 
                      data-width="${p.width}" data-height="${p.height}">
                <span class="text-[11px] font-bold ${isActive ? 'text-accent' : 'text-slate-800'} group-hover:text-accent transition-colors">${p.name}</span>
                <span class="text-[9px] ${isActive ? 'text-accent/60' : 'text-slate-400'} font-bold mt-1 uppercase tracking-tight">${p.width} × ${p.height} px</span>
              </button>
            `;
				})
				.join('')}
        </div>
      </div>
    `,
			)
			.join('');

		modalContent.innerHTML = `
			<div class="mb-4">
				<input id="preset-search" type="search" placeholder="Search sizes or preset names..." class="w-full input-field" />
			</div>
			<div class="space-y-6">${groupsHtml}</div>
		`;

		modalContent.querySelectorAll<HTMLElement>('.modal-preset-btn').forEach((btn) => {
			btn.addEventListener('click', () => {
				const width = parseInt(btn.dataset.width!);
				const height = parseInt(btn.dataset.height!);
				updateState({ width, height });
				presetsModal?.classList.remove('show');
			});
		});

		const presetSearch = el<HTMLInputElement>('preset-search');
		let presetSearchTimeout: ReturnType<typeof setTimeout>;
		presetSearch?.addEventListener('input', (e) => {
			clearTimeout(presetSearchTimeout);
			const q = ((e.target as HTMLInputElement).value || '').trim().toLowerCase();
			presetSearchTimeout = setTimeout(() => {
				modalContent!.querySelectorAll<HTMLElement>('.modal-preset-btn').forEach((btn) => {
					const txt = (btn.innerText || '').toLowerCase();
					const dims = `${btn.dataset.width} ${btn.dataset.height}`;
					const match = q ? txt.indexOf(q) !== -1 || dims.indexOf(q) !== -1 : true;
					btn.style.display = match ? '' : 'none';
				});

				modalContent!.querySelectorAll<HTMLElement>('.preset-group').forEach((group) => {
					const anyVisible = Array.from(group.querySelectorAll<HTMLElement>('.modal-preset-btn')).some((b) => b.style.display !== 'none');
					group.style.display = anyVisible ? '' : 'none';
				});
			}, 120);
		});
	}

	let searchTimeout: ReturnType<typeof setTimeout>;
	let currentSearchController: AbortController | null = null;
	let searchRequestId = 0;

	searchInput.addEventListener('input', (e) => {
		clearTimeout(searchTimeout);
		const query = (e.target as HTMLInputElement).value;
		if (!query || query.length < 2) {
			searchResults?.classList.add('hidden');
			if (currentSearchController) {
				try {
					currentSearchController.abort();
				} catch {
					/* already aborted/settled — safe to ignore */
				}
				currentSearchController = null;
			}
			return;
		}

		searchTimeout = setTimeout(async () => {
			if (currentSearchController) {
				try {
					currentSearchController.abort();
				} catch {
					/* already aborted/settled — safe to ignore */
				}
			}
			const controller = new AbortController();
			currentSearchController = controller;
			const thisRequestId = ++searchRequestId;

			searchLoading?.classList.remove('hidden');

			let results: Awaited<ReturnType<typeof searchLocation>> = [];
			try {
				results = await searchLocation(query, { limit: 15, signal: controller.signal });
			} catch {
				results = [];
			}

			if (thisRequestId !== searchRequestId) return;

			searchLoading?.classList.add('hidden');

			if (results && results.length > 0) {
				searchResults.innerHTML = results
					.map(
						(r) => `
		  <div class="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${r.shortName}" data-country="${r.country || ''}">
			${r.name}
		  </div>
		`,
					)
					.join('');
				searchResults.classList.remove('hidden');
			} else {
				searchResults.classList.add('hidden');
			}

			if (currentSearchController === controller) currentSearchController = null;
		}, 1000);
	});

	let lastSelectionAt = 0;
	function selectResultElement(item: HTMLElement): void {
		const lat = parseFloat(item.dataset.lat!);
		const lon = parseFloat(item.dataset.lon!);
		const name = item.dataset.name!;
		const country = item.dataset.country!;

		updateState({
			city: (name || '').toUpperCase(),
			country: (country || '').toUpperCase(),
			lat,
			lon,
			markers: [{ lat, lon }],
			routeStartLat: lat,
			routeStartLon: lon,
			routeEndLat: lat - 0.005,
			routeEndLon: lon + 0.005,
			routeViaPoints: [],
			routeGeometry: [],
		});

		updateMapPosition(lat, lon);
		updateMarkerStyles(state);

		if (state.showRoute) {
			updateRouteGeometry().then(() => {
				updateRouteStyles(state);
			});
		}

		searchInput.value = name;
		searchResults.classList.add('hidden');
		lastSelectionAt = Date.now();
	}

	searchResults.addEventListener('pointerdown', (e) => {
		const item = (e.target as HTMLElement).closest<HTMLElement>('[data-lat]');
		if (item) {
			selectResultElement(item);
			e.preventDefault();
		}
	});

	searchResults.addEventListener('click', (e) => {
		if (Date.now() - lastSelectionAt < 500) return;
		const item = (e.target as HTMLElement).closest<HTMLElement>('[data-lat]');
		if (item) selectResultElement(item);
	});

	latInput.addEventListener('change', (e) => {
		const lat = parseFloat((e.target as HTMLInputElement).value);
		const newMarkers = [...(state.markers || [])];
		if (newMarkers.length > 0) newMarkers[0] = { ...newMarkers[0]!, lat };
		updateState({ lat, markers: newMarkers });
		updateMapPosition(lat, state.lon);
		updateMarkerStyles(state);
	});

	lonInput.addEventListener('change', (e) => {
		const lon = parseFloat((e.target as HTMLInputElement).value);
		const newMarkers = [...(state.markers || [])];
		if (newMarkers.length > 0) newMarkers[0] = { ...newMarkers[0]!, lon };
		updateState({ lon, markers: newMarkers });
		updateMapPosition(state.lat, lon);
		updateMarkerStyles(state);
	});

	if (cityOverrideInput) {
		cityOverrideInput.value = state.cityOverride || '';
		cityOverrideInput.addEventListener('input', (e) => {
			const v = (e.target as HTMLInputElement).value;
			updateState({ cityOverride: v ? v.toUpperCase() : '' });
		});
	}

	if (countryOverrideInput) {
		countryOverrideInput.value = state.countryOverride || '';
		countryOverrideInput.addEventListener('input', (e) => {
			const v = (e.target as HTMLInputElement).value;
			updateState({ countryOverride: v ? v.toUpperCase() : '' });
		});
	}

	el('toggle-country-btn')?.addEventListener('click', () => {
		updateState({ showCountry: !state.showCountry });
	});

	el('toggle-coords-btn')?.addEventListener('click', () => {
		updateState({ showCoords: !state.showCoords });
	});

	cityFontSelect?.addEventListener('change', (e) => {
		updateState({ cityFont: (e.target as HTMLSelectElement).value });
	});

	countryFontSelect?.addEventListener('change', (e) => {
		updateState({ countryFont: (e.target as HTMLSelectElement).value });
	});

	coordsFontSelect?.addEventListener('change', (e) => {
		updateState({ coordsFont: (e.target as HTMLSelectElement).value });
	});

	function sanitizeCoordInput(v: string): string {
		if (!v) return v;
		v = String(v).replace(/,/g, '.');
		v = v.replace(/[^0-9.\-]/g, '');
		const hasMinus = v.indexOf('-') !== -1;
		v = v.replace(/-/g, '');
		if (hasMinus) v = '-' + v;
		const firstDot = v.indexOf('.');
		if (firstDot !== -1) {
			v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
		}
		return v;
	}

	latInput.addEventListener('input', (e) => {
		const input = e.target as HTMLInputElement;
		const cleaned = sanitizeCoordInput(input.value);
		if (cleaned !== input.value) input.value = cleaned;
	});

	lonInput.addEventListener('input', (e) => {
		const input = e.target as HTMLInputElement;
		const cleaned = sanitizeCoordInput(input.value);
		if (cleaned !== input.value) input.value = cleaned;
	});

	zoomSlider.addEventListener('input', (e) => {
		const zoom = parseInt((e.target as HTMLInputElement).value);
		updateState({ zoom });
		updateMapPosition(undefined, undefined, zoom);
	});

	const pitchSlider = el<HTMLInputElement>('pitch-slider');
	const pitchValue = el<HTMLElement>('pitch-value');
	const bearingSlider = el<HTMLInputElement>('bearing-slider');
	const bearingValue = el<HTMLElement>('bearing-value');

	pitchSlider?.addEventListener('input', (e) => {
		const pitch = parseInt((e.target as HTMLInputElement).value);
		updateState({ pitch });
		updateMapTilt(pitch, undefined);
	});

	bearingSlider?.addEventListener('input', (e) => {
		const bearing = parseInt((e.target as HTMLInputElement).value);
		updateState({ bearing });
		updateMapTilt(undefined, bearing);
	});

	// --- Print & Navigation (Phase 5) ---
	const museumMarginBtn = el<HTMLButtonElement>('museum-margin-btn');
	const printBorderToggle = el<HTMLInputElement>('print-border-toggle');
	const bleedGuideToggle = el<HTMLInputElement>('bleed-guide-toggle');
	const bleedGuideSettings = el<HTMLElement>('bleed-guide-settings');
	const bleedMmInput = el<HTMLInputElement>('bleed-mm-input');
	const exportDpiInput = el<HTMLInputElement>('export-dpi-input');
	const scaleBarToggle = el<HTMLInputElement>('scale-bar-toggle');
	const compassRoseToggle = el<HTMLInputElement>('compass-rose-toggle');

	museumMarginBtn?.addEventListener('click', () => {
		const shortSide = Math.min(state.width, state.height);
		updateState({ matEnabled: true, matWidth: Math.round(shortSide * 0.12), matShowBorder: false });
	});

	printBorderToggle?.addEventListener('change', (e) => {
		updateState({ showPrintBorder: (e.target as HTMLInputElement).checked });
	});

	bleedGuideToggle?.addEventListener('change', (e) => {
		updateState({ showBleedGuide: (e.target as HTMLInputElement).checked });
	});

	bleedMmInput?.addEventListener('change', (e) => {
		const mm = parseFloat((e.target as HTMLInputElement).value);
		if (isFinite(mm) && mm >= 0) updateState({ bleedMm: mm });
	});

	exportDpiInput?.addEventListener('change', (e) => {
		const dpi = parseInt((e.target as HTMLInputElement).value);
		if (isFinite(dpi) && dpi > 0) updateState({ exportDpi: dpi });
	});

	scaleBarToggle?.addEventListener('change', (e) => {
		updateState({ showScaleBar: (e.target as HTMLInputElement).checked });
	});

	compassRoseToggle?.addEventListener('change', (e) => {
		updateState({ showCompassRose: (e.target as HTMLInputElement).checked });
	});

	modeTile.addEventListener('click', () => {
		updateState({ renderMode: 'tile' });
		updateRouteStyles(state);
	});
	modeArtistic.addEventListener('click', () => {
		updateState({ renderMode: 'artistic' });
		updateRouteStyles(state);
	});

	let _themeChangeTimer: ReturnType<typeof setTimeout>;
	function applyThemeChange(value: string): void {
		updateState({ theme: value });
		if (state.renderMode === 'tile') {
			const t = getSelectedTheme();
			if (t && t.tileUrl) updateMapTheme(t.tileUrl);
			invalidateMapSize();
			updateRouteStyles(state);
			updateMarkerStyles(state);
		}
	}

	if (themeSelect) {
		const onThemeInput = (e: Event) => {
			const v = (e.target as HTMLSelectElement).value;
			clearTimeout(_themeChangeTimer);
			_themeChangeTimer = setTimeout(() => applyThemeChange(v), 120);
		};
		themeSelect.addEventListener('change', onThemeInput);
		themeSelect.addEventListener('input', onThemeInput);
	}

	labelsToggle?.addEventListener('change', (e) => {
		updateState({ showLabels: (e.target as HTMLInputElement).checked });
	});

	show3dBuildingsToggle?.addEventListener('change', (e) => {
		updateState({ show3dBuildings: (e.target as HTMLInputElement).checked });
		refreshMapLibreOverlays();
	});

	showContoursToggle?.addEventListener('change', (e) => {
		updateState({ showContours: (e.target as HTMLInputElement).checked });
		refreshMapLibreOverlays();
	});

	showGraticuleToggle?.addEventListener('change', (e) => {
		updateState({ showGraticule: (e.target as HTMLInputElement).checked });
		refreshMapLibreOverlays();
	});

	invertWaterLandToggle?.addEventListener('change', (e) => {
		updateState({ invertWaterLand: (e.target as HTMLInputElement).checked });
		refreshMapLibreOverlays();
	});

	const transitToggle = el<HTMLInputElement>('transit-toggle');
	transitToggle?.addEventListener('change', (e) => {
		updateState({ transitEnabled: (e.target as HTMLInputElement).checked });
		refreshMapLibreOverlays();
	});

	// --- Custom Track (GPX/GeoJSON upload + draw tool + styling) ---
	const customTrackToggle = el<HTMLInputElement>('custom-track-toggle');
	const uploadTrackBtn = el<HTMLButtonElement>('upload-track-btn');
	const drawTrackBtn = el<HTMLButtonElement>('draw-track-btn');
	const trackFileInput = el<HTMLInputElement>('track-file-input');
	const trackSourceLabel = el<HTMLElement>('track-source-label');
	const trackStyleSettings = el<HTMLElement>('track-style-settings');
	const trackColorPicker = el<HTMLInputElement>('track-color-picker');
	const trackWidthSlider = el<HTMLInputElement>('track-width-slider');
	const trackWidthValue = el<HTMLElement>('track-width-value');
	const trackGlowToggle = el<HTMLInputElement>('track-glow-toggle');
	const clearTrackBtn = el<HTMLButtonElement>('clear-track-btn');

	customTrackToggle?.addEventListener('change', (e) => {
		updateState({ showCustomTrack: (e.target as HTMLInputElement).checked });
	});

	uploadTrackBtn?.addEventListener('click', () => trackFileInput?.click());

	trackFileInput?.addEventListener('change', (e) => {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			try {
				const text = ev.target!.result as string;
				const points = file.name.toLowerCase().endsWith('.gpx') ? parseGPX(text) : parseGeoJSONTrack(text);
				updateState({ customTrackPoints: points, showCustomTrack: true, customTrackSourceName: file.name });
			} catch (err) {
				alert(err instanceof Error ? err.message : 'Could not read this file.');
			}
			input.value = '';
		};
		reader.readAsText(file);
	});

	let drawSession: DrawSession | null = null;
	let drawnPoints: [number, number][] = [];
	drawTrackBtn?.addEventListener('click', () => {
		if (drawSession) {
			drawSession.stop();
			drawSession = null;
			drawTrackBtn.textContent = 'Draw Path';
			drawTrackBtn.classList.remove('bg-accent', 'text-white');
			return;
		}
		drawnPoints = [];
		drawSession = startDrawSession((lon, lat) => {
			drawnPoints = [...drawnPoints, [lon, lat]];
			updateState({ customTrackPoints: drawnPoints, showCustomTrack: true, customTrackSourceName: 'Drawn path' });
		});
		drawTrackBtn.textContent = 'Finish Drawing (click map to add points)';
		drawTrackBtn.classList.add('bg-accent', 'text-white');
	});

	trackColorPicker?.addEventListener('input', (e) => {
		updateState({ customTrackColor: (e.target as HTMLInputElement).value });
	});

	trackWidthSlider?.addEventListener('input', (e) => {
		const width = parseInt((e.target as HTMLInputElement).value);
		updateState({ customTrackWidth: width });
		if (trackWidthValue) trackWidthValue.textContent = `${width}px`;
	});

	trackGlowToggle?.addEventListener('change', (e) => {
		updateState({ customTrackGlow: (e.target as HTMLInputElement).checked });
	});

	clearTrackBtn?.addEventListener('click', () => {
		if (drawSession) {
			drawSession.stop();
			drawSession = null;
			drawTrackBtn!.textContent = 'Draw Path';
			drawTrackBtn!.classList.remove('bg-accent', 'text-white');
		}
		updateState({ customTrackPoints: [], showCustomTrack: false, customTrackSourceName: '' });
	});

	// --- Custom POIs (labeled pins dropped on a searched address) ---
	const poiAddressInput = el<HTMLInputElement>('poi-address-input');
	const poiLabelInput = el<HTMLInputElement>('poi-label-input');
	const addPoiBtn = el<HTMLButtonElement>('add-poi-btn');
	const poiList = el<HTMLElement>('poi-list');

	addPoiBtn?.addEventListener('click', async () => {
		const address = (poiAddressInput?.value || '').trim();
		const label = (poiLabelInput?.value || '').trim();
		if (!address) {
			poiAddressInput?.focus();
			return;
		}
		addPoiBtn.disabled = true;
		try {
			const results = await searchLocation(address, { limit: 1 });
			const first = results[0];
			if (!first) {
				alert('Could not find that address.');
				return;
			}
			const pois = [...(state.customPois || [])];
			pois.push({ lat: first.lat, lon: first.lon, label: label || first.shortName });
			updateState({ customPois: pois });
			if (poiAddressInput) poiAddressInput.value = '';
			if (poiLabelInput) poiLabelInput.value = '';
		} finally {
			addPoiBtn.disabled = false;
		}
	});

	function renderPoiList(currentState: CartisState): void {
		if (!poiList) return;
		const pois = currentState.customPois || [];
		if (pois.length === 0) {
			poiList.innerHTML = '';
			return;
		}
		poiList.innerHTML = pois
			.map(
				(poi, idx) => `
			<div class="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl">
				<span class="text-[11px] font-semibold text-slate-700 truncate">${poi.label}</span>
				<button class="remove-poi-btn text-slate-300 hover:text-red-500 transition-colors shrink-0 ml-2" data-idx="${idx}">
					<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
				</button>
			</div>`,
			)
			.join('');

		poiList.querySelectorAll<HTMLElement>('.remove-poi-btn').forEach((btn) => {
			btn.addEventListener('click', () => {
				const idx = parseInt(btn.dataset.idx!);
				const pois = [...(state.customPois || [])];
				pois.splice(idx, 1);
				updateState({ customPois: pois });
			});
		});
	}

	// --- Heatmap (bulk coordinate upload) ---
	const heatmapToggle = el<HTMLInputElement>('heatmap-toggle');
	const uploadHeatmapBtn = el<HTMLButtonElement>('upload-heatmap-btn');
	const heatmapFileInput = el<HTMLInputElement>('heatmap-file-input');
	const heatmapSourceLabel = el<HTMLElement>('heatmap-source-label');

	heatmapToggle?.addEventListener('change', (e) => {
		updateState({ heatmapEnabled: (e.target as HTMLInputElement).checked });
	});

	uploadHeatmapBtn?.addEventListener('click', () => heatmapFileInput?.click());

	heatmapFileInput?.addEventListener('change', (e) => {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			try {
				const text = ev.target!.result as string;
				const points = parseCoordinateFile(text, file.name);
				updateState({ heatmapPoints: points, heatmapEnabled: true, heatmapSourceName: `${file.name} (${points.length} points)` });
			} catch (err) {
				alert(err instanceof Error ? err.message : 'Could not read this file.');
			}
			input.value = '';
		};
		reader.readAsText(file);
	});

	markerToggle?.addEventListener('change', (e) => {
		const show = (e.target as HTMLInputElement).checked;
		if (show) {
			if (!state.markers || state.markers.length === 0) {
				updateState({ markers: [{ lat: state.lat, lon: state.lon }] });
			}
		}
		updateState({ showMarker: show });
		updateMarkerStyles(state);
		markerSettings?.classList.toggle('hidden', !show);
	});

	el('add-marker-btn')?.addEventListener('click', () => {
		const newMarkers = [...(state.markers || [])];
		newMarkers.push({ lat: state.lat, lon: state.lon });
		updateState({ markers: newMarkers });
		updateMarkerStyles(state);
	});

	el('remove-marker-btn')?.addEventListener('click', () => {
		const newMarkers = [...(state.markers || [])];
		if (newMarkers.length > 0) {
			newMarkers.pop();
			updateState({ markers: newMarkers });
			updateMarkerStyles(state);
		}
	});

	el('clear-markers-btn')?.addEventListener('click', () => {
		updateState({ markers: [], showMarker: false });
		if (markerToggle) markerToggle.checked = false;
		updateMarkerStyles(state);
		markerSettings?.classList.add('hidden');
	});

	routeToggle?.addEventListener('change', async (e) => {
		const show = (e.target as HTMLInputElement).checked;

		if (show) {
			updateState({
				routeStartLat: state.lat,
				routeStartLon: state.lon,
				routeEndLat: state.lat - 0.005,
				routeEndLon: state.lon + 0.005,
				routeViaPoints: [],
			});
			await updateRouteGeometry();
		}

		updateState({ showRoute: show });
		el('route-settings')?.classList.toggle('hidden', !show);
		updateRouteStyles(state);
	});

	document.querySelectorAll<HTMLButtonElement>('.travel-mode-btn').forEach((btn) => {
		btn.addEventListener('click', async () => {
			const mode = btn.dataset.mode as CartisState['travelMode'];
			const defaultStyle = (mode === 'flight' ? 'curved-arc' : mode === 'train' ? 'dashed' : 'solid') as CartisState['routeStyle'];
			const startIcon = (mode === 'flight' ? 'airplane' : mode === 'train' ? 'train' : mode === 'cycling' || mode === 'walking' ? 'circle' : 'car') as CartisState['routeStartIcon'];
			const endIcon = (mode === 'flight' ? 'airplane' : 'flag') as CartisState['routeEndIcon'];

			updateState({
				travelMode: mode,
				routeStyle: defaultStyle,
				routeStartIcon: startIcon,
				routeEndIcon: endIcon,
			});

			await updateRouteGeometry();
			updateRouteStyles(state);
		});
	});

	const startInput = el<HTMLInputElement>('route-start-input');
	const endInput = el<HTMLInputElement>('route-end-input');

	startInput?.addEventListener('change', async () => {
		const val = startInput.value.trim();
		if (!val) return;
		const results = await searchLocation(val);
		const res = results[0];
		if (res) {
			updateState({
				routeStartLat: res.lat,
				routeStartLon: res.lon,
				routeStartCity: res.shortName.toUpperCase(),
			});
			await updateRouteGeometry();
			fitMapToRoute();
			updateRouteStyles(state);
		}
	});

	endInput?.addEventListener('change', async () => {
		const val = endInput.value.trim();
		if (!val) return;
		const results = await searchLocation(val);
		const res = results[0];
		if (res) {
			updateState({
				routeEndLat: res.lat,
				routeEndLon: res.lon,
				routeEndCity: res.shortName.toUpperCase(),
			});
			await updateRouteGeometry();
			fitMapToRoute();
			updateRouteStyles(state);
		}
	});

	el<HTMLSelectElement>('famous-journey-select')?.addEventListener('change', async (e) => {
		const presetId = (e.target as HTMLSelectElement).value;
		if (!presetId) return;
		const preset = FAMOUS_JOURNEYS.find((j) => j.id === presetId);
		if (preset) {
			updateState({
				showRoute: true,
				routeStartLat: preset.startLat,
				routeStartLon: preset.startLon,
				routeStartCity: preset.startCity,
				routeEndLat: preset.endLat,
				routeEndLon: preset.endLon,
				routeEndCity: preset.endCity,
				travelMode: preset.travelMode,
				renderMode: preset.renderMode,
				artisticTheme: preset.artisticTheme,
				theme: preset.theme,
				routeStartIcon: preset.startIcon,
				routeEndIcon: preset.endIcon,
				routeStyle: preset.routeStyle,
				routeColor: preset.routeColor,
				routeViaPoints: [],
			});
			el('route-settings')?.classList.remove('hidden');
			const showRouteToggle = el<HTMLInputElement>('show-route-toggle');
			if (showRouteToggle) showRouteToggle.checked = true;
			await updateRouteGeometry();
			fitMapToRoute();
			updateRouteStyles(state);
		}
	});

	const playAnimBtn = el<HTMLButtonElement>('play-anim-btn');
	playAnimBtn?.addEventListener('click', () => {
		if (isAnimationPlaying()) {
			stopJourneyAnimation();
			playAnimBtn.innerHTML = '<span>▶ Play Journey</span>';
		} else {
			startJourneyAnimation(8000, () => {
				playAnimBtn.innerHTML = '<span>▶ Play Journey</span>';
			});
			playAnimBtn.innerHTML = '<span>⏸ Pause Journey</span>';
		}
	});

	const recordVideoBtn = el<HTMLButtonElement>('record-video-btn');
	recordVideoBtn?.addEventListener('click', async () => {
		recordVideoBtn.innerHTML = '<span>⏳ Recording...</span>';
		const blob = await recordJourneyVideo(8000);
		recordVideoBtn.innerHTML = '<span>📹 Export Video</span>';
		if (blob) {
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `cartis_journey_${Date.now()}.webm`;
			a.click();
			URL.revokeObjectURL(url);
		}
	});

	const addPhotoBtn = el('add-photo-pin-btn');
	const photoFileInput = el<HTMLInputElement>('photo-pin-file-input');

	addPhotoBtn?.addEventListener('click', () => {
		photoFileInput?.click();
	});

	photoFileInput?.addEventListener('change', () => {
		const file = photoFileInput.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			const dataUrl = ev.target?.result as string;
			if (dataUrl) {
				const caption = prompt('Enter photo caption:', 'Memory Point') || '';
				addPhotoPin(state.lat, state.lon, dataUrl, caption);
			}
		};
		reader.readAsDataURL(file);
		photoFileInput.value = '';
	});

	const showQrToggle = el<HTMLInputElement>('show-qr-toggle');
	const qrSettings = el('qr-settings');
	const qrUrlInput = el<HTMLInputElement>('qr-url-input');

	showQrToggle?.addEventListener('change', (e) => {
		const show = (e.target as HTMLInputElement).checked;
		updateState({ showQrCode: show });
		qrSettings?.classList.toggle('hidden', !show);
	});

	qrUrlInput?.addEventListener('input', (e) => {
		updateState({ qrCodeUrl: (e.target as HTMLInputElement).value });
	});

	const dualCityToggle = el<HTMLInputElement>('dual-city-toggle');
	const dualCitySettings = el('dual-city-settings');
	const city2Input = el<HTMLInputElement>('city2-input');

	dualCityToggle?.addEventListener('change', (e) => {
		const show = (e.target as HTMLInputElement).checked;
		updateState({ dualCityEnabled: show });
		dualCitySettings?.classList.toggle('hidden', !show);
	});

	city2Input?.addEventListener('change', async () => {
		const val = city2Input.value.trim();
		if (!val) return;
		const results = await searchLocation(val);
		const res = results[0];
		if (res) {
			updateState({
				city2: res.shortName.toUpperCase(),
				country2: res.country.toUpperCase(),
				lat2: res.lat,
				lon2: res.lon,
			});
		}
	});

	el('fit-route-btn')?.addEventListener('click', () => {
		fitMapToRoute();
	});

	el<HTMLSelectElement>('route-style-select')?.addEventListener('change', (e) => {
		updateState({ routeStyle: (e.target as HTMLSelectElement).value as CartisState['routeStyle'] });
		updateRouteStyles(state);
	});

	el<HTMLInputElement>('route-color-input')?.addEventListener('input', (e) => {
		updateState({ routeColor: (e.target as HTMLInputElement).value });
		updateRouteStyles(state);
	});

	el<HTMLInputElement>('route-width-slider')?.addEventListener('input', (e) => {
		const val = parseInt((e.target as HTMLInputElement).value);
		updateState({ routeWidth: val });
		const widthValEl = el('route-width-val');
		if (widthValEl) widthValEl.textContent = `${val}px`;
		updateRouteStyles(state);
	});

	el<HTMLInputElement>('route-glow-toggle')?.addEventListener('change', (e) => {
		updateState({ routeGlow: (e.target as HTMLInputElement).checked });
		updateRouteStyles(state);
	});

	el<HTMLSelectElement>('route-start-icon-select')?.addEventListener('change', (e) => {
		updateState({ routeStartIcon: (e.target as HTMLSelectElement).value as CartisState['routeStartIcon'] });
		updateRouteStyles(state);
	});

	el<HTMLSelectElement>('route-end-icon-select')?.addEventListener('change', (e) => {
		updateState({ routeEndIcon: (e.target as HTMLSelectElement).value as CartisState['routeEndIcon'] });
		updateRouteStyles(state);
	});

	el<HTMLSelectElement>('overlay-badge-style-select')?.addEventListener('change', (e) => {
		updateState({ overlayBadgeStyle: (e.target as HTMLSelectElement).value as CartisState['overlayBadgeStyle'] });
	});

	el('reset-route-btn')?.addEventListener('click', async () => {
		updateState({ routeViaPoints: [] });
		await updateRouteGeometry();
		updateRouteStyles(state);
	});

	overlayBgButtons.forEach((btn) => {
		btn.addEventListener('click', () => {
			updateState({ overlayBgType: btn.dataset.bg as CartisState['overlayBgType'] });
		});
	});

	if (overlaySizeGroup) {
		overlaySizeButtons.forEach((btn) => {
			btn.addEventListener('click', () => {
				const size = btn.dataset.size as CartisState['overlaySize'];
				updateState({ overlaySize: size });
			});
		});
	}

	presetBtns.forEach((btn) => {
		btn.addEventListener('click', () => {
			const width = parseInt(btn.dataset.width!);
			const height = parseInt(btn.dataset.height!);
			updateState({ width, height });
		});
	});

	const MAX_RES = 50000;
	customW?.addEventListener('change', (e) => {
		let val = parseInt((e.target as HTMLInputElement).value) || state.width;
		if (val > MAX_RES) val = MAX_RES;
		updateState({ width: val });
	});
	customH?.addEventListener('change', (e) => {
		let val = parseInt((e.target as HTMLInputElement).value) || state.height;
		if (val > MAX_RES) val = MAX_RES;
		updateState({ height: val });
	});

	function doResetSettings(): void {
		if (confirm('Are you sure you want to reset all settings?')) {
			updateState(defaultState);
		}
	}
	el('reset-settings-btn')?.addEventListener('click', doResetSettings);
	['mobile-reset-a-btn', 'mobile-reset-b-btn', 'mobile-reset-c-btn'].forEach((id) => {
		el(id)?.addEventListener('click', doResetSettings);
	});

	const overlayPosBtns = document.querySelectorAll<HTMLElement>('.overlay-pos-btn');
	const overlayPositionGroup = el('overlay-position-group');
	overlayPosBtns.forEach((btn) => {
		btn.addEventListener('click', () => {
			const x = parseFloat(btn.dataset.overlayX!);
			const y = parseFloat(btn.dataset.overlayY!);
			updateState({ overlayX: x, overlayY: y });
		});
	});

	el('reset-overlay-pos-btn')?.addEventListener('click', () => {
		updateState({ overlayX: 0.5, overlayY: 0.85 });
	});

	const draggableOverlay = el<HTMLElement>('poster-overlay');
	const posterContainerForDrag = el<HTMLElement>('poster-container');

	if (draggableOverlay && posterContainerForDrag) {
		let isDragging = false;
		let dragStartClientX = 0;
		let dragStartClientY = 0;
		let dragStartOverlayX = 0.5;
		let dragStartOverlayY = 0.85;

		const startDrag = (clientX: number, clientY: number) => {
			if (state.overlaySize === ('none' as CartisState['overlaySize'])) return;
			isDragging = true;
			dragStartClientX = clientX;
			dragStartClientY = clientY;
			dragStartOverlayX = state.overlayX !== undefined ? state.overlayX : 0.5;
			dragStartOverlayY = state.overlayY !== undefined ? state.overlayY : 0.85;
			draggableOverlay.style.cursor = 'grabbing';
			document.body.style.userSelect = 'none';
		};

		const doDrag = (clientX: number, clientY: number) => {
			if (!isDragging) return;
			const rect = posterContainerForDrag.getBoundingClientRect();
			const dx = (clientX - dragStartClientX) / rect.width;
			const dy = (clientY - dragStartClientY) / rect.height;

			const EDGE = 8;
			const cW = posterContainerForDrag.offsetWidth;
			const cH = posterContainerForDrag.offsetHeight;
			const oW = draggableOverlay.offsetWidth;
			const oH = draggableOverlay.offsetHeight;
			const minX = cW > 0 && oW > 0 ? (oW / 2 + EDGE) / cW : 0.05;
			const maxX = cW > 0 && oW > 0 ? 1 - (oW / 2 + EDGE) / cW : 0.95;
			const minY = cH > 0 && oH > 0 ? (oH / 2 + EDGE) / cH : 0.05;
			const maxY = cH > 0 && oH > 0 ? 1 - (oH / 2 + EDGE) / cH : 0.95;

			const newX = Math.max(minX, Math.min(maxX, dragStartOverlayX + dx));
			const newY = Math.max(minY, Math.min(maxY, dragStartOverlayY + dy));
			updateState({ overlayX: newX, overlayY: newY });
		};

		const endDrag = () => {
			if (!isDragging) return;
			isDragging = false;
			draggableOverlay.style.cursor = '';
			document.body.style.userSelect = '';
		};

		draggableOverlay.addEventListener('mousedown', (e) => {
			startDrag(e.clientX, e.clientY);
			e.preventDefault();
		});
		document.addEventListener('mousemove', (e) => doDrag(e.clientX, e.clientY));
		document.addEventListener('mouseup', endDrag);

		draggableOverlay.addEventListener(
			'touchstart',
			(e) => {
				if (e.touches.length === 1) {
					startDrag(e.touches[0]!.clientX, e.touches[0]!.clientY);
					e.preventDefault();
				}
			},
			{ passive: false },
		);
		document.addEventListener(
			'touchmove',
			(e) => {
				if (isDragging && e.touches.length === 1) {
					doDrag(e.touches[0]!.clientX, e.touches[0]!.clientY);
					e.preventDefault();
				}
			},
			{ passive: false },
		);
		document.addEventListener('touchend', endDrag);
	}

	return (currentState: CartisState) => {
		updatePhotoPinMarkers();
		if (cityOverrideInput) cityOverrideInput.value = currentState.cityOverride || '';
		if (countryOverrideInput) countryOverrideInput.value = currentState.countryOverride || '';
		if (cityFontSelect) cityFontSelect.value = currentState.cityFont;
		if (countryFontSelect) countryFontSelect.value = currentState.countryFont;
		if (coordsFontSelect) coordsFontSelect.value = currentState.coordsFont;

		const EYE_OPEN_SVG = `<svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>`;
		const EYE_OFF_SVG = `<svg class="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>`;

		const toggleCountryBtnSync = el('toggle-country-btn');
		if (toggleCountryBtnSync) {
			toggleCountryBtnSync.innerHTML = currentState.showCountry !== false ? EYE_OPEN_SVG : EYE_OFF_SVG;
		}
		const toggleCoordsBtnSync = el('toggle-coords-btn');
		if (toggleCoordsBtnSync) {
			toggleCoordsBtnSync.innerHTML = currentState.showCoords !== false ? EYE_OPEN_SVG : EYE_OFF_SVG;
		}

		const overlayPosBtnsSync = document.querySelectorAll<HTMLElement>('.overlay-pos-btn');
		const curX = currentState.overlayX !== undefined ? currentState.overlayX : 0.5;
		const curY = currentState.overlayY !== undefined ? currentState.overlayY : 0.85;

		overlayPositionGroup?.classList.toggle('hidden', (currentState.overlaySize || 'medium') === ('none' as CartisState['overlaySize']));
		const TOLERANCE = 0.02;
		overlayPosBtnsSync.forEach((btn) => {
			const bx = parseFloat(btn.dataset.overlayX!);
			const by = parseFloat(btn.dataset.overlayY!);
			const isActive = Math.abs(curX - bx) < TOLERANCE && Math.abs(curY - by) < TOLERANCE;
			const dot = btn.querySelector<HTMLElement>('.pos-dot');
			if (isActive) {
				btn.classList.add('border-accent', 'bg-accent-light');
				btn.classList.remove('border-slate-100', 'bg-slate-50');
				if (dot) {
					dot.classList.add('bg-accent');
					dot.classList.remove('bg-slate-300');
				}
			} else {
				btn.classList.remove('border-accent', 'bg-accent-light');
				btn.classList.add('border-slate-100', 'bg-slate-50');
				if (dot) {
					dot.classList.remove('bg-accent');
					dot.classList.add('bg-slate-300');
				}
			}
		});

		latInput.value = currentState.lat.toFixed(6);
		lonInput.value = currentState.lon.toFixed(6);
		zoomSlider.value = String(currentState.zoom);
		zoomValue.textContent = String(currentState.zoom);

		if (pitchSlider) pitchSlider.value = String(currentState.pitch || 0);
		if (pitchValue) pitchValue.textContent = `${currentState.pitch || 0}°`;
		if (bearingSlider) bearingSlider.value = String(currentState.bearing || 0);
		if (bearingValue) bearingValue.textContent = `${currentState.bearing || 0}°`;

		if (printBorderToggle) printBorderToggle.checked = !!currentState.showPrintBorder;
		if (bleedGuideToggle) bleedGuideToggle.checked = !!currentState.showBleedGuide;
		bleedGuideSettings?.classList.toggle('hidden', !currentState.showBleedGuide);
		if (bleedMmInput) bleedMmInput.value = String(currentState.bleedMm ?? DEFAULT_BLEED_MM);
		if (exportDpiInput) exportDpiInput.value = String(currentState.exportDpi || DEFAULT_EXPORT_DPI);
		if (scaleBarToggle) scaleBarToggle.checked = !!currentState.showScaleBar;
		if (compassRoseToggle) compassRoseToggle.checked = !!currentState.showCompassRose;

		const mode = currentState.travelMode || 'driving';
		document.querySelectorAll<HTMLButtonElement>('.travel-mode-btn').forEach((btn) => {
			const active = btn.dataset.mode === mode;
			btn.classList.toggle('active', active);
			btn.classList.toggle('bg-slate-900', active);
			btn.classList.toggle('text-white', active);
			btn.classList.toggle('border-slate-900', active);
			btn.classList.toggle('bg-slate-50', !active);
			btn.classList.toggle('text-slate-700', !active);
			btn.classList.toggle('border-slate-200', !active);
		});

		const distDisplay = el('route-distance-display');
		if (distDisplay) {
			if (currentState.routeDistanceKm) {
				distDisplay.textContent = `${currentState.routeDistanceKm} km / ${currentState.routeDistanceMiles} mi`;
			} else {
				distDisplay.textContent = 'Ready';
			}
		}

		const routeStyleSelect = el<HTMLSelectElement>('route-style-select');
		if (routeStyleSelect) routeStyleSelect.value = currentState.routeStyle || 'solid';

		const routeColorInput = el<HTMLInputElement>('route-color-input');
		if (routeColorInput && currentState.routeColor) routeColorInput.value = currentState.routeColor;

		const routeWidthSlider = el<HTMLInputElement>('route-width-slider');
		if (routeWidthSlider) routeWidthSlider.value = String(currentState.routeWidth || 4);
		const routeWidthVal = el('route-width-val');
		if (routeWidthVal) routeWidthVal.textContent = `${currentState.routeWidth || 4}px`;

		const routeGlowToggle = el<HTMLInputElement>('route-glow-toggle');
		if (routeGlowToggle) routeGlowToggle.checked = currentState.routeGlow !== false;

		const startIconSelect = el<HTMLSelectElement>('route-start-icon-select');
		if (startIconSelect) startIconSelect.value = currentState.routeStartIcon || 'pin';

		const endIconSelect = el<HTMLSelectElement>('route-end-icon-select');
		if (endIconSelect) endIconSelect.value = currentState.routeEndIcon || 'pin';

		const overlayBadgeStyleSelect = el<HTMLSelectElement>('overlay-badge-style-select');
		if (overlayBadgeStyleSelect) overlayBadgeStyleSelect.value = currentState.overlayBadgeStyle || 'standard';

		if (currentState.renderMode === 'tile') {
			modeTile.className = 'flex-1 py-2 text-xs font-bold rounded-lg bg-accent text-white shadow-sm';
			modeArtistic.className = 'flex-1 py-2 text-xs font-bold rounded-lg text-slate-500 hover:text-slate-900';
			standardThemeConfig?.classList.remove('hidden');
			artisticThemeConfig?.classList.add('hidden');
			labelsControl?.classList.remove('hidden');
		} else {
			modeTile.className = 'flex-1 py-2 text-xs font-bold rounded-lg text-slate-500 hover:text-slate-900';
			modeArtistic.className = 'flex-1 py-2 text-xs font-bold rounded-lg bg-accent text-white shadow-sm';
			standardThemeConfig?.classList.add('hidden');
			artisticThemeConfig?.classList.remove('hidden');
			labelsControl?.classList.add('hidden');
		}

		if (themeSelect) themeSelect.value = currentState.theme;
		if (artisticMainGrid) {
			const mainKeys = new Set(['cyber_noir', 'golden_era', 'mangrove_maze']);
			const selectedKey = currentState.artisticTheme;
			artisticMainGrid.querySelectorAll<HTMLElement>('.art-card').forEach((btn) => {
				const k = btn.dataset.key!;
				let active = false;
				if (k === 'other') {
					active = !!(selectedKey && !mainKeys.has(selectedKey));
				} else {
					active = k === selectedKey;
				}
				btn.classList.toggle('border-accent', active);
				btn.classList.toggle('bg-accent-light', active);
				if (active) btn.classList.add('ring-accent');
				else btn.classList.remove('ring-accent');

				if (k === 'other') {
					const spans = btn.querySelectorAll<HTMLElement>('span.w-6.h-6');
					const activeThemeObj = artisticThemes[selectedKey] || (selectedKey?.startsWith('custom_') ? loadCustomThemes()[selectedKey] : null);
					if (selectedKey && activeThemeObj && !mainKeys.has(selectedKey)) {
						const p = paletteFor(activeThemeObj);
						spans.forEach((s, i) => {
							s.style.background = p[i] || '#cccccc';
						});
					} else {
						spans.forEach((s) => {
							s.style.background = '#cccccc';
						});
					}
				}
			});
		}

		const artisticTheme = getSelectedArtisticTheme();
		artisticDesc.textContent = artisticTheme.description;

		if (labelsToggle) labelsToggle.checked = !!currentState.showLabels;
		if (show3dBuildingsToggle) show3dBuildingsToggle.checked = !!currentState.show3dBuildings;
		if (showContoursToggle) showContoursToggle.checked = !!currentState.showContours;
		if (showGraticuleToggle) showGraticuleToggle.checked = !!currentState.showGraticule;
		if (invertWaterLandToggle) invertWaterLandToggle.checked = !!currentState.invertWaterLand;
		if (transitToggle) transitToggle.checked = !!currentState.transitEnabled;

		if (customTrackToggle) customTrackToggle.checked = !!currentState.showCustomTrack;
		const hasTrackPoints = (currentState.customTrackPoints || []).length > 0;
		trackStyleSettings?.classList.toggle('hidden', !hasTrackPoints);
		if (trackColorPicker) trackColorPicker.value = currentState.customTrackColor || '#ef4444';
		if (trackWidthSlider) trackWidthSlider.value = String(currentState.customTrackWidth || 4);
		if (trackWidthValue) trackWidthValue.textContent = `${currentState.customTrackWidth || 4}px`;
		if (trackGlowToggle) trackGlowToggle.checked = !!currentState.customTrackGlow;
		if (trackSourceLabel) {
			trackSourceLabel.textContent = currentState.customTrackSourceName ? `Loaded: ${currentState.customTrackSourceName} (${(currentState.customTrackPoints || []).length} points)` : '';
		}

		renderPoiList(currentState);

		if (heatmapToggle) heatmapToggle.checked = !!currentState.heatmapEnabled;
		if (heatmapSourceLabel) heatmapSourceLabel.textContent = currentState.heatmapSourceName || '';

		if (markerToggle) {
			markerToggle.checked = !!currentState.showMarker;
			markerSettings?.classList.toggle('hidden', !currentState.showMarker);
		}

		const markerCountDisplay = el('marker-count');
		if (markerCountDisplay) {
			markerCountDisplay.textContent = String((currentState.markers || []).length);
		}

		if (markerIconSelect) markerIconSelect.value = currentState.markerIcon || 'pin';
		if (markerSizeSlider) {
			const size = Math.round((currentState.markerSize || 1) * 40);
			markerSizeSlider.value = String(size);
			if (markerSizeValue) markerSizeValue.textContent = `${size}px`;
		}

		if (routeToggle) {
			routeToggle.checked = !!currentState.showRoute;
			el('route-settings')?.classList.toggle('hidden', !currentState.showRoute);
		}

		const routeCountDisplay = el('route-count');
		if (routeCountDisplay) {
			const viaPoints = (currentState.routeViaPoints || []).length;
			routeCountDisplay.textContent = String(2 + viaPoints);
		}

		if (overlayBgButtons.length) {
			overlayBgButtons.forEach((b) => {
				const style = b.dataset.bg;
				if (style === (currentState.overlayBgType || 'vignette')) {
					b.classList.add('bg-accent', 'text-white');
					b.classList.remove('bg-slate-50');
				} else {
					b.classList.remove('bg-accent', 'text-white');
					b.classList.add('bg-slate-50');
				}
			});
		}
		if (overlaySizeButtons.length) {
			overlaySizeButtons.forEach((b) => {
				const s = b.dataset.size;
				if (s === (currentState.overlaySize || 'medium')) {
					b.classList.add('bg-accent', 'text-white');
					b.classList.remove('bg-slate-50');
				} else {
					b.classList.remove('bg-accent', 'text-white');
					b.classList.add('bg-slate-50');
				}
			});
		}

		if (customW) customW.value = String(currentState.width);
		if (customH) customH.value = String(currentState.height);

		if (labelsToggle) labelsToggle.checked = !!currentState.showLabels;
		if (markerToggle) markerToggle.checked = !!currentState.showMarker;
		if (markerSettings) {
			if (currentState.showMarker) markerSettings.classList.remove('hidden');
			else markerSettings.classList.add('hidden');
		}

		if (markerIconSelect) markerIconSelect.value = currentState.markerIcon || 'pin';
		if (markerSizeSlider) {
			const sizePx = Math.round((currentState.markerSize || 1) * 40);
			markerSizeSlider.value = String(sizePx);
			if (markerSizeValue) markerSizeValue.textContent = `${sizePx}px`;
		}

		if (matToggle) matToggle.checked = !!currentState.matEnabled;
		if (matSettings) {
			if (currentState.matEnabled) matSettings.classList.remove('hidden');
			else matSettings.classList.add('hidden');
		}
		if (matWidthSlider) matWidthSlider.value = String(currentState.matWidth || 40);
		if (matWidthValue) matWidthValue.textContent = `${currentState.matWidth || 40}px`;
		if (matBorderToggle) matBorderToggle.checked = !!currentState.matShowBorder;

		if (matBorderSettings) {
			if (currentState.matEnabled && currentState.matShowBorder) matBorderSettings.classList.remove('hidden');
			else matBorderSettings.classList.add('hidden');
		}
		if (matBorderWidthSlider) matBorderWidthSlider.value = String(currentState.matBorderWidth || 1);
		if (matBorderWidthValue) matBorderWidthValue.textContent = `${currentState.matBorderWidth || 1}px`;
		if (matBorderOpacitySlider) matBorderOpacitySlider.value = String(currentState.matBorderOpacity || 1);
		if (matBorderOpacityValue) matBorderOpacityValue.textContent = `${Math.round((currentState.matBorderOpacity || 1) * 100)}%`;

		let isMainPresetActive = false;
		if (presetBtns.length) {
			presetBtns.forEach((btn) => {
				const w = parseInt(btn.dataset.width!);
				const h = parseInt(btn.dataset.height!);
				if (w === currentState.width && h === currentState.height) {
					btn.classList.add('bg-accent', 'text-white');
					btn.classList.remove('bg-slate-50');
					isMainPresetActive = true;
				} else {
					btn.classList.remove('bg-accent', 'text-white');
					btn.classList.add('bg-slate-50');
				}
			});
		}

		if (otherPresetsBtn) {
			if (!isMainPresetActive) {
				otherPresetsBtn.classList.add('bg-accent', 'text-white');
				otherPresetsBtn.classList.remove('bg-slate-50');
			} else {
				otherPresetsBtn.classList.remove('bg-accent', 'text-white');
				otherPresetsBtn.classList.add('bg-slate-50');
			}
		}

		let accentColor = '#0f172a';
		if (currentState.renderMode === 'artistic') {
			const theme = getSelectedArtisticTheme();
			accentColor = theme.road_primary || theme.text || '#0f172a';
			exportBtn.classList.remove('bg-slate-900');
			exportBtn.classList.add('bg-accent');
		} else {
			accentColor = '#0f172a';
			exportBtn.classList.add('bg-slate-900');
			exportBtn.classList.remove('bg-accent');
		}

		const r = parseInt(accentColor.slice(1, 3), 16);
		const g = parseInt(accentColor.slice(3, 5), 16);
		const b = parseInt(accentColor.slice(5, 7), 16);
		document.documentElement.style.setProperty('--accent-color-rgb', `${r}, ${g}, ${b}`);
	};
}

let lastWidth: number | null = null;
let lastHeight: number | null = null;
let lastMatEnabled: boolean | null = null;
let lastMatWidth: number | null = null;

let _lastArtisticTheme: string | null = null;
let _lastRenderMode: string | null = null;

const TEXT_SCALE_REFERENCE = 1080;
const OVERLAY_SIZE_MULTIPLIER: Record<string, number> = {
	small: 0.75,
	medium: 1,
	large: 1.35,
};

const BASE_OVERLAY_TEXT = {
	pad: 48,
	city: 64,
	country: 20,
	coords: 16,
	gap: 12,
	cityGap: 40,
	dividerWidth: 128,
	dividerHeight: 1,
	attribution: 8,
	attributionOffset: 12,
};

function getPosterTextScale(width: number, height: number): number {
	const shortestSide = Math.max(1, Math.min(width || TEXT_SCALE_REFERENCE, height || TEXT_SCALE_REFERENCE));
	return shortestSide / TEXT_SCALE_REFERENCE;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function getOverlayTextConfig(width: number, height: number, size = 'medium') {
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

interface PosterTextLayoutElements {
	overlay?: HTMLElement | null;
	city?: HTMLElement | null;
	country?: HTMLElement | null;
	coords?: HTMLElement | null;
	divider?: HTMLElement | null;
	attribution?: HTMLElement | null;
}

function applyPosterTextLayout(elements: PosterTextLayoutElements, currentState: CartisState): void {
	const size = currentState.overlaySize || 'medium';
	const sizeConfig = getOverlayTextConfig(currentState.width, currentState.height, size);
	const overlayGap = sizeConfig.gap;

	if (elements.overlay) {
		elements.overlay.style.padding = `${sizeConfig.pad}px`;
		elements.overlay.style.gap = `${overlayGap}px`;
	}
	if (elements.city) {
		elements.city.style.fontSize = `${sizeConfig.city}px`;
		elements.city.style.lineHeight = '1.12';
		elements.city.style.margin = '0px';
	}
	if (elements.country) {
		elements.country.style.fontSize = `${sizeConfig.country}px`;
		elements.country.style.lineHeight = '1.2';
		elements.country.style.margin = '0px';
	}
	if (elements.coords) {
		elements.coords.style.fontSize = `${sizeConfig.coords}px`;
		elements.coords.style.lineHeight = '1.2';
		elements.coords.style.margin = '0px';
	}
	if (elements.divider) {
		elements.divider.style.width = `${sizeConfig.dividerWidth}px`;
		elements.divider.style.height = `${sizeConfig.dividerHeight}px`;
		elements.divider.style.margin = '0px';
	}
	if (elements.attribution) {
		const offset = sizeConfig.attributionOffset;
		elements.attribution.style.fontSize = `${sizeConfig.attribution}px`;
		elements.attribution.style.lineHeight = '1.2';
		elements.attribution.style.right = `${(currentState.matEnabled ? currentState.matWidth || 0 : 0) + offset}px`;
		elements.attribution.style.bottom = `${(currentState.matEnabled ? currentState.matWidth || 0 : 0) + offset}px`;
	}
}

export function updatePreviewStyles(currentState: CartisState): void {
	const posterContainer = el<HTMLElement>('poster-container');
	const posterScaler = el<HTMLElement>('poster-scaler');
	const displayCity = el<HTMLElement>('display-city');
	const displayCountry = el<HTMLElement>('display-country');
	const displayCoords = el<HTMLElement>('display-coords');
	const overlay = el<HTMLElement>('poster-overlay');
	const overlayBg = overlay ? overlay.querySelector<HTMLElement>('.overlay-bg') : null;
	const vignetteOverlay = el<HTMLElement>('vignette-overlay');
	const matBorder = el<HTMLElement>('mat-border');
	const divider = el<HTMLElement>('poster-divider');
	const attribution = el<HTMLElement>('poster-attribution');
	const printBorder = el<HTMLElement>('print-border');
	const bleedGuide = el<HTMLElement>('bleed-guide');
	const scaleBar = el<HTMLElement>('scale-bar');
	const scaleBarLine = el<HTMLElement>('scale-bar-line');
	const scaleBarLabel = el<HTMLElement>('scale-bar-label');
	const compassRose = el<HTMLElement>('compass-rose');

	if (!posterContainer || !posterScaler || !displayCity || !displayCoords) return;

	const theme = getSelectedTheme();
	const artisticTheme = getSelectedArtisticTheme();

	const isArtistic = currentState.renderMode === 'artistic';
	const mapPreview = el<HTMLElement>('map-preview');
	const artisticMapDiv = el<HTMLElement>('artistic-map');

	const activeTheme = (isArtistic ? artisticTheme : theme) as ArtisticTheme & { background?: string; textColor?: string };

	const matEnabled = currentState.matEnabled;
	const matWidth = matEnabled ? currentState.matWidth || 0 : 0;
	const showBorder = matEnabled && currentState.matShowBorder;
	const borderColor = activeTheme.text || activeTheme.textColor || '#000000';
	const borderWidth = currentState.matBorderWidth || 1;
	const borderOpacity = currentState.matBorderOpacity || 1;

	if (isArtistic) {
		if (mapPreview) {
			mapPreview.style.visibility = 'hidden';
			mapPreview.style.pointerEvents = 'none';
		}
		if (artisticMapDiv) {
			artisticMapDiv.style.visibility = 'visible';
			artisticMapDiv.style.pointerEvents = 'auto';
		}

		if (_lastRenderMode !== 'artistic' || _lastArtisticTheme !== currentState.artisticTheme) {
			updateArtisticStyle(artisticTheme);
		}
	} else {
		if (mapPreview) {
			mapPreview.style.visibility = 'visible';
			mapPreview.style.pointerEvents = 'auto';
		}
		if (artisticMapDiv) {
			artisticMapDiv.style.visibility = 'hidden';
			artisticMapDiv.style.pointerEvents = 'none';
		}
	}
	_lastRenderMode = currentState.renderMode;
	_lastArtisticTheme = currentState.artisticTheme;

	[mapPreview, artisticMapDiv].forEach((element) => {
		if (element) {
			element.style.top = `${matWidth}px`;
			element.style.left = `${matWidth}px`;
			element.style.right = `${matWidth}px`;
			element.style.bottom = `${matWidth}px`;
			element.style.outline = 'none';
		}
	});

	if (matBorder) {
		if (matEnabled && showBorder) {
			matBorder.style.display = 'block';
			matBorder.style.top = `${matWidth}px`;
			matBorder.style.left = `${matWidth}px`;
			matBorder.style.right = `${matWidth}px`;
			matBorder.style.bottom = `${matWidth}px`;
			matBorder.style.border = `${borderWidth}px solid ${borderColor}`;
			matBorder.style.opacity = String(borderOpacity);
		} else {
			matBorder.style.display = 'none';
		}
	}

	if (vignetteOverlay) {
		vignetteOverlay.style.top = `${matWidth}px`;
		vignetteOverlay.style.left = `${matWidth}px`;
		vignetteOverlay.style.right = `${matWidth}px`;
		vignetteOverlay.style.bottom = `${matWidth}px`;
	}

	const themeTextColor = activeTheme.text || activeTheme.textColor || '#000000';

	if (printBorder) {
		if (currentState.showPrintBorder) {
			printBorder.classList.remove('hidden');
			printBorder.style.color = themeTextColor;
		} else {
			printBorder.classList.add('hidden');
		}
	}

	if (bleedGuide) {
		if (currentState.showBleedGuide) {
			const dpi = currentState.exportDpi || DEFAULT_EXPORT_DPI;
			const bleedPx = mmToPx(currentState.bleedMm ?? DEFAULT_BLEED_MM, dpi);
			bleedGuide.classList.remove('hidden');
			bleedGuide.style.top = `${bleedPx}px`;
			bleedGuide.style.left = `${bleedPx}px`;
			bleedGuide.style.right = `${bleedPx}px`;
			bleedGuide.style.bottom = `${bleedPx}px`;
		} else {
			bleedGuide.classList.add('hidden');
		}
	}

	if (scaleBar && scaleBarLine && scaleBarLabel) {
		if (currentState.showScaleBar) {
			const maxBarPx = currentState.width * 0.15;
			const spec = computeScaleBar(currentState.lat, currentState.zoom, maxBarPx);
			if (spec.widthPx > 0) {
				scaleBar.classList.remove('hidden');
				scaleBar.style.display = 'flex';
				scaleBar.style.color = themeTextColor;
				scaleBarLine.style.width = `${spec.widthPx}px`;
				scaleBarLabel.textContent = spec.label;
				scaleBarLabel.style.color = themeTextColor;
			} else {
				scaleBar.classList.add('hidden');
			}
		} else {
			scaleBar.classList.add('hidden');
		}
	}

	if (compassRose) {
		if (currentState.showCompassRose) {
			compassRose.classList.remove('hidden');
			compassRose.style.color = themeTextColor;
			compassRose.style.transform = `rotate(${-(currentState.bearing || 0)}deg)`;
		} else {
			compassRose.classList.add('hidden');
		}
	}

	const qrBadge = el('poster-qr-badge');
	if (qrBadge) {
		if (currentState.showQrCode && currentState.qrCodeUrl) {
			qrBadge.classList.remove('hidden');
			qrBadge.innerHTML = generateQrCodeSvg(currentState.qrCodeUrl, 64, activeTheme.text || activeTheme.textColor || '#000000', '#ffffff');
		} else {
			qrBadge.classList.add('hidden');
		}
	}

	const sizeChanged = lastWidth !== currentState.width || lastHeight !== currentState.height;
	const matChanged = lastMatEnabled !== currentState.matEnabled || lastMatWidth !== currentState.matWidth;

	lastWidth = currentState.width;
	lastHeight = currentState.height;
	lastMatEnabled = currentState.matEnabled;
	lastMatWidth = currentState.matWidth;

	posterContainer.style.width = `${currentState.width}px`;
	posterContainer.style.height = `${currentState.height}px`;
	posterContainer.style.backgroundColor = activeTheme.bg || activeTheme.background || '#ffffff';

	const parent = posterScaler.parentElement;
	if (parent) {
		const isMobile = window.innerWidth < 768;
		const padding = isMobile ? 40 : 120;
		const availableW = parent.clientWidth - padding;
		const availableH = parent.clientHeight - padding;

		const scaleW = availableW / currentState.width;
		const scaleH = availableH / currentState.height;
		const scale = Math.min(scaleW, scaleH, 1);

		posterScaler.style.transform = `scale(${scale})`;
	}

	displayCity.style.color = activeTheme.text || activeTheme.textColor || '#000000';
	displayCity.style.fontFamily = currentState.cityFont;

	if (displayCountry) {
		displayCountry.style.color = activeTheme.text || activeTheme.textColor || '#000000';
		displayCountry.style.fontFamily = currentState.countryFont;
	}

	displayCoords.style.color = activeTheme.text || activeTheme.textColor || '#000000';
	displayCoords.style.fontFamily = currentState.coordsFont;

	const badgeStyle = currentState.overlayBadgeStyle || 'standard';

	if (badgeStyle === 'travel_stats') {
		const startName = currentState.routeStartCity || 'ORIGIN';
		const endName = currentState.routeEndCity || 'DESTINATION';
		const mode = (currentState.travelMode || 'driving').toUpperCase();
		const distance = currentState.routeDistanceKm ? `${currentState.routeDistanceKm} KM (${currentState.routeDistanceMiles} MI)` : 'JOURNEY';

		displayCity.textContent = `${startName} ➔ ${endName}`;
		if (displayCountry) {
			displayCountry.textContent = `${mode} ROUTE · ${distance}`;
			displayCountry.style.display = 'block';
		}
		displayCoords.textContent = `${formatCoords(currentState.routeStartLat, currentState.routeStartLon)} ➔ ${formatCoords(currentState.routeEndLat, currentState.routeEndLon)}`;
		displayCoords.style.display = '';
	} else if (badgeStyle === 'boarding_pass') {
		const startName = currentState.routeStartCity || 'ORIGIN';
		const endName = currentState.routeEndCity || 'DESTINATION';
		const mode = (currentState.travelMode || 'flight').toUpperCase();

		displayCity.textContent = `✈ ${startName} / ${endName}`;
		if (displayCountry) {
			displayCountry.textContent = `BOARDING PASS · ${mode} · ${currentState.routeDistanceKm || 0} KM`;
			displayCountry.style.display = 'block';
		}
		displayCoords.textContent = `TICKET NO. CARTIS-${Math.abs(Math.round(currentState.routeStartLat * 100))}`;
		displayCoords.style.display = '';
	} else {
		if (currentState.dualCityEnabled) {
			const c1 = currentState.cityOverride && currentState.cityOverride.length ? currentState.cityOverride : currentState.city;
			const c2 = currentState.city2 || 'BALI';
			displayCity.textContent = `${c1} & ${c2}`;
			if (displayCountry) {
				displayCountry.textContent = `${currentState.country} · ${currentState.country2 || 'INDONESIA'}`;
				displayCountry.style.display = 'block';
			}
		} else {
			displayCity.textContent = currentState.cityOverride && currentState.cityOverride.length ? currentState.cityOverride : currentState.city;
			if (displayCountry) {
				displayCountry.textContent = currentState.countryOverride && currentState.countryOverride.length ? currentState.countryOverride : currentState.country;
				const countryHasText = !!displayCountry.textContent;
				displayCountry.style.display = currentState.showCountry !== false && countryHasText ? 'block' : 'none';
			}
		}
		displayCoords.textContent = formatCoords(currentState.lat, currentState.lon);
		displayCoords.style.display = currentState.showCoords !== false ? '' : 'none';
	}

	if (overlay) {
		const size = currentState.overlaySize || 'medium';
		if (size === ('none' as CartisState['overlaySize'])) {
			overlay.style.display = 'none';
			if (overlayBg) {
				overlayBg.style.display = 'none';
				overlayBg.style.backdropFilter = '';
				(overlayBg.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = '';
			}
			const bgTypeNone = currentState.overlayBgType || 'vignette';
			const colorNone = activeTheme.background || activeTheme.bg || '#ffffff';
			if (vignetteOverlay) {
				if (bgTypeNone === 'vignette') {
					vignetteOverlay.style.display = '';
					vignetteOverlay.style.opacity = '1';
					const colorSolid = hexToRgba(colorNone, 1);
					const colorTrans = hexToRgba(colorNone, 0);
					vignetteOverlay.style.background = `linear-gradient(to bottom, ${colorSolid} 0%, ${colorSolid} 3%, ${colorTrans} 20%, ${colorTrans} 80%, ${colorSolid} 97%, ${colorSolid} 100%)`;
				} else if ((bgTypeNone as string) === 'radial') {
					vignetteOverlay.style.display = '';
					vignetteOverlay.style.opacity = '1';
					const colorSolid = hexToRgba(colorNone, 1);
					const colorTrans = hexToRgba(colorNone, 0);
					vignetteOverlay.style.background = `radial-gradient(circle, ${colorTrans} 0%, ${colorTrans} 20%, ${hexToRgba(colorNone, 0.4)} 70%, ${colorSolid} 100%)`;
				} else {
					vignetteOverlay.style.display = 'none';
					vignetteOverlay.style.opacity = '0';
					vignetteOverlay.style.background = '';
				}
			}
		} else {
			overlay.style.display = '';
			applyPosterTextLayout({ overlay, city: displayCity, country: displayCountry, coords: displayCoords, divider, attribution }, currentState);

			const overlayX = currentState.overlayX !== undefined ? currentState.overlayX : 0.5;
			const overlayY = currentState.overlayY !== undefined ? currentState.overlayY : 0.85;
			overlay.style.right = '';
			overlay.style.bottom = '';
			overlay.style.transform = 'translate(-50%, -50%)';
			overlay.style.maxWidth = '90%';
			overlay.style.width = 'max-content';

			overlay.style.left = `${overlayX * 100}%`;
			overlay.style.top = `${overlayY * 100}%`;
			{
				const EDGE = 8;
				const cW = posterContainer.offsetWidth;
				const cH = posterContainer.offsetHeight;
				const oW = overlay.offsetWidth;
				const oH = overlay.offsetHeight;
				if (cW > 0 && cH > 0 && oW > 0 && oH > 0) {
					const cx = Math.max((oW / 2 + EDGE) / cW, Math.min(1 - (oW / 2 + EDGE) / cW, overlayX));
					const cy = Math.max((oH / 2 + EDGE) / cH, Math.min(1 - (oH / 2 + EDGE) / cH, overlayY));
					overlay.style.left = `${cx * 100}%`;
					overlay.style.top = `${cy * 100}%`;
				}
			}

			const bgType = currentState.overlayBgType || 'vignette';
			const color = activeTheme.background || activeTheme.bg || '#ffffff';

			if (overlayBg) {
				overlayBg.style.display = 'none';
				overlayBg.style.backdropFilter = '';
				(overlayBg.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = '';
			}

			if (vignetteOverlay) {
				if (bgType === 'vignette') {
					vignetteOverlay.style.display = '';
					vignetteOverlay.style.opacity = '1';
					const colorSolid = hexToRgba(color, 1);
					const colorTrans = hexToRgba(color, 0);
					vignetteOverlay.style.background = `linear-gradient(to bottom, ${colorSolid} 0%, ${colorSolid} 3%, ${colorTrans} 20%, ${colorTrans} 80%, ${colorSolid} 97%, ${colorSolid} 100%)`;
				} else if ((bgType as string) === 'radial') {
					vignetteOverlay.style.display = '';
					vignetteOverlay.style.opacity = '1';
					const colorSolid = hexToRgba(color, 1);
					const colorTrans = hexToRgba(color, 0);
					vignetteOverlay.style.background = `radial-gradient(circle, ${colorTrans} 0%, ${colorTrans} 20%, ${hexToRgba(color, 0.4)} 70%, ${colorSolid} 100%)`;
				} else {
					vignetteOverlay.style.display = 'none';
				}
			}
		}
	}
	if (divider) {
		divider.style.backgroundColor = activeTheme.text || activeTheme.textColor || '#000000';
		const countryVisible = currentState.showCountry !== false && !!(displayCountry && displayCountry.textContent);
		const coordsVisible = currentState.showCoords !== false;
		divider.style.display = countryVisible || coordsVisible ? '' : 'none';
	}
	if (attribution) {
		attribution.style.color = activeTheme.text || activeTheme.textColor || '#000000';
	}

	updateMarkerStyles(currentState);

	if (sizeChanged || matChanged) {
		setTimeout(() => {
			invalidateMapSize();
			updateMapPosition(currentState.lat, currentState.lon, currentState.zoom, { animate: false });
		}, 350);

		setTimeout(() => {
			invalidateMapSize();
			updateMapPosition(currentState.lat, currentState.lon, currentState.zoom, { animate: false });
		}, 550);
	}
}
