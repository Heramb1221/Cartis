import '../style.css';

import { subscribe, state, updateState, getSelectedTheme, getSelectedArtisticTheme } from './core/store';
import { initMap, updateMapTheme, invalidateMapSize, waitForTilesLoad, waitForArtisticIdle, updateMarkerStyles, updateRouteStyles, refreshMapLibreOverlays } from './map/map-init';
import { updateCustomTrackStyles } from './map/routes/custom-track-manager';
import { updatePoiStyles } from './map/markers/poi-manager';
import { exportToPNG } from './export/png-export';
import { exportToPDF } from './export/pdf-export';
import { exportToSVG } from './export/svg-overlay-export';
import { exportBatch, batchFilenameBase, type BatchExportProgress } from './export/batch-export';
import { buildShareURL, readStateFromURL } from './core/share-url';
import { checkPrintSafety } from './core/print-safety';
import { setupControls, updatePreviewStyles } from './ui/form';
import type { CartisState } from './types/state';
import type { OutputPreset } from './core/output-presets';

// Load any shared state from the URL before anything else initializes,
// so the map/theme/composition start from the shared configuration
// rather than defaults-then-flicker-to-shared.
const sharedState = await readStateFromURL();
if (sharedState) {
	updateState(sharedState);
	// strip the (potentially large) query param from the visible URL once loaded,
	// so further sharing/reloading doesn't keep re-appending onto an existing one
	window.history.replaceState({}, '', window.location.pathname);
}

const initialTheme = getSelectedTheme();
try {
	initMap('map-preview', [state.lat, state.lon], state.zoom, initialTheme.tileUrl);
} catch (err) {
	console.error('Failed to initialize map:', err);
}

const syncUI = setupControls();

const exportBtn = document.getElementById('export-btn') as HTMLButtonElement | null;
const exportBtnLabel = document.getElementById('export-btn-label') as HTMLElement | null;
const exportFormatNote = document.getElementById('export-format-note') as HTMLElement | null;
const mobileExportBtn = document.getElementById('mobile-export-btn') as HTMLButtonElement | null;
const posterContainer = document.getElementById('poster-container') as HTMLElement | null;
const printSafetyWarning = document.getElementById('print-safety-warning') as HTMLElement | null;
const batchExportBtn = document.getElementById('batch-export-btn') as HTMLButtonElement | null;
const shareLinkBtn = document.getElementById('share-link-btn') as HTMLButtonElement | null;
const formatButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.export-format-btn'));

type ExportFormat = 'png' | 'pdf' | 'svg';
let currentFormat: ExportFormat = 'png';

const FORMAT_LABELS: Record<ExportFormat, string> = {
	png: 'Generate Export',
	pdf: 'Export as PDF',
	svg: 'Export as SVG',
};
const FORMAT_NOTES: Record<ExportFormat, string> = {
	png: '',
	pdf: 'Embeds a high-resolution image sized to your export DPI — not a vector PDF (the map itself can\u2019t be vectorized).',
	svg: 'Map is embedded as an image; text, frame, scale bar, and compass stay true vector and scale infinitely.',
};

function setExportFormat(format: ExportFormat): void {
	currentFormat = format;
	formatButtons.forEach((btn) => {
		const active = btn.dataset.format === format;
		btn.classList.toggle('bg-accent', active);
		btn.classList.toggle('text-white', active);
		btn.classList.toggle('border-accent', active);
		btn.classList.toggle('bg-white', !active);
		btn.classList.toggle('text-slate-500', !active);
		btn.classList.toggle('border-slate-100', !active);
	});
	if (exportBtnLabel) exportBtnLabel.textContent = FORMAT_LABELS[format];
	if (exportFormatNote) exportFormatNote.textContent = FORMAT_NOTES[format];
}
formatButtons.forEach((btn) => {
	btn.addEventListener('click', () => setExportFormat((btn.dataset.format as ExportFormat) || 'png'));
});
setExportFormat('png');

let _exportCheckInProgress = false;
const originalExportInner = exportBtn ? exportBtn.innerHTML : '';
let exportLoadingMode: 'loading' | 'processing' | null = null;

function updatePrintSafetyWarning(currentState: CartisState): void {
	if (!printSafetyWarning) return;
	if (currentState.renderMode !== 'artistic') {
		printSafetyWarning.classList.add('hidden');
		return;
	}
	const theme = getSelectedArtisticTheme();
	const flagged = checkPrintSafety({
		'Road (Motorway)': theme.road_motorway,
		'Road (Primary)': theme.road_primary,
		Route: theme.route,
		Water: theme.water,
	});
	if (flagged.length === 0) {
		printSafetyWarning.classList.add('hidden');
		return;
	}
	printSafetyWarning.classList.remove('hidden');
	printSafetyWarning.textContent = `Heads up: ${flagged.map((f) => f.label).join(', ')} ${flagged.length === 1 ? 'is a' : 'are'} highly saturated and may print duller/shifted than it looks on screen (CMYK gamut).`;
}

subscribe((currentState) => {
	if (currentState.renderMode === 'tile') {
		const theme = getSelectedTheme();
		const tileUrl = currentState.showLabels ? theme.tileUrl : theme.tileUrlNoLabels;
		updateMapTheme(tileUrl);
	}

	updatePreviewStyles(currentState);

	updateMarkerStyles(currentState);
	updateRouteStyles(currentState);
	updateCustomTrackStyles(currentState);
	updatePoiStyles(currentState);
	if (currentState.renderMode === 'artistic') refreshMapLibreOverlays();

	updatePrintSafetyWarning(currentState);

	syncUI(currentState);
	void ensurePreviewReady();
});

function setExportButtonLoading(loading: boolean, mode: 'loading' | 'processing' = 'loading'): void {
	const buttons = [exportBtn, mobileExportBtn].filter((b): b is HTMLButtonElement => !!b);
	if (loading && mode === 'loading' && exportLoadingMode === 'processing') return;

	exportLoadingMode = loading ? mode : null;

	buttons.forEach((btn) => {
		btn.disabled = !!loading;
		btn.setAttribute('aria-busy', loading ? 'true' : 'false');
		btn.classList.toggle('opacity-60', !!loading);
		btn.classList.toggle('cursor-not-allowed', !!loading);
	});

	if (exportBtn) {
		if (loading) {
			exportBtn.innerHTML = `
				<div class="flex items-center justify-center space-x-3">
					<div class="flex items-center space-x-1">
						<div class="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style="animation-delay: 0s"></div>
						<div class="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
						<div class="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
					</div>
					<span>${mode === 'processing' ? 'Processing...' : 'Loading...'}</span>
				</div>
			`;
		} else {
			exportBtn.innerHTML = originalExportInner;
			const label = document.getElementById('export-btn-label');
			if (label) label.textContent = FORMAT_LABELS[currentFormat];
		}
	}

	if (mobileExportBtn) {
		if (loading) {
			mobileExportBtn.innerHTML = `<svg class="w-6 h-6 text-white animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
		} else {
			mobileExportBtn.innerHTML = `<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>`;
		}
	}
}

async function ensurePreviewReady(): Promise<void> {
	if (_exportCheckInProgress) return;
	if (exportLoadingMode === 'processing') return;
	_exportCheckInProgress = true;
	try {
		setExportButtonLoading(true, 'loading');
		if (state.renderMode === 'artistic') {
			await waitForArtisticIdle(30000);
		} else {
			await waitForTilesLoad(30000);
		}
	} finally {
		setExportButtonLoading(false);
		_exportCheckInProgress = false;
	}
}

async function handleExportClick(): Promise<void> {
	// posterContainer existing is just a sanity check that the app shell
	// rendered — the export pipelines themselves no longer read from the DOM tree.
	if (!posterContainer) return;
	const base = `Cartis-${state.city.replace(/\s+/g, '-')}-${Date.now()}`;
	setExportButtonLoading(true, 'processing');
	try {
		if (currentFormat === 'pdf') {
			await exportToPDF(`${base}.pdf`, null);
		} else if (currentFormat === 'svg') {
			await exportToSVG(`${base}.svg`, null);
		} else {
			await exportToPNG(null, `${base}.png`, null);
		}
	} finally {
		setExportButtonLoading(false);
	}
}

exportBtn?.addEventListener('click', handleExportClick);
mobileExportBtn?.addEventListener('click', handleExportClick);

// Batch export uses the three "quick" output presets already shown as buttons
// in the Output Size section (Square/Portrait/Landscape) rather than a full
// custom multi-select picker — a scoped-down take on "batch export across
// presets" that covers the common case without a much larger picker UI.
const BATCH_PRESETS: OutputPreset[] = [
	{ name: 'Square', width: 1080, height: 1080 },
	{ name: 'Portrait', width: 1080, height: 1920 },
	{ name: 'Landscape', width: 1920, height: 1080 },
];

batchExportBtn?.addEventListener('click', async () => {
	if (!batchExportBtn) return;
	const original = batchExportBtn.textContent;
	batchExportBtn.disabled = true;
	try {
		await exportBatch(BATCH_PRESETS, batchFilenameBase(), (progress: BatchExportProgress) => {
			batchExportBtn.textContent = `${progress.currentLabel} (${progress.completed}/${progress.total})`;
		});
	} catch (err) {
		console.error('Batch export failed:', err);
		alert('Batch export failed. Please try again.');
	} finally {
		batchExportBtn.disabled = false;
		batchExportBtn.textContent = original;
	}
});

shareLinkBtn?.addEventListener('click', async () => {
	if (!shareLinkBtn) return;
	const original = shareLinkBtn.textContent;
	try {
		const url = await buildShareURL(state);
		await navigator.clipboard.writeText(url);
		shareLinkBtn.textContent = 'Copied!';
	} catch (err) {
		console.error('Failed to build/copy share link:', err);
		shareLinkBtn.textContent = 'Copy failed';
	} finally {
		setTimeout(() => {
			if (shareLinkBtn) shareLinkBtn.textContent = original;
		}, 1800);
	}
});

void ensurePreviewReady();

window.addEventListener('resize', () => {
	updatePreviewStyles(state);
});

setTimeout(invalidateMapSize, 500);
