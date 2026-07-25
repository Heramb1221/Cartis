import JSZip from 'jszip';
import { composePosterCanvas } from './png-export';
import { state } from '../core/store';
import type { OutputPreset } from '../core/output-presets';

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 1.0));
}

export interface BatchExportProgress {
	completed: number;
	total: number;
	currentLabel: string;
}

/**
 * Renders one PNG per preset (each at that preset's own dimensions, via
 * composePosterCanvas's width/height override) and zips them together.
 * Presets are rendered sequentially, not in parallel — MapLibre only has
 * one canvas to resize/capture from, so concurrent captures would race
 * on the same container.
 */
export async function exportBatch(presets: OutputPreset[], baseFilename: string, onProgress?: (progress: BatchExportProgress) => void): Promise<void> {
	const zip = new JSZip();

	for (let i = 0; i < presets.length; i++) {
		const preset = presets[i]!;
		onProgress?.({ completed: i, total: presets.length, currentLabel: preset.name });

		const canvas = await composePosterCanvas(preset.width, preset.height);
		const blob = await canvasToBlob(canvas);
		if (blob) {
			const safeName = preset.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
			zip.file(`${baseFilename}-${safeName}-${preset.width}x${preset.height}.png`, blob);
		}
	}

	onProgress?.({ completed: presets.length, total: presets.length, currentLabel: 'Packaging...' });

	const zipBlob = await zip.generateAsync({ type: 'blob' });
	const url = URL.createObjectURL(zipBlob);
	const link = document.createElement('a');
	link.download = `${baseFilename}-batch.zip`;
	link.href = url;
	link.click();
	URL.revokeObjectURL(url);
}

/** Convenience wrapper using the current city name as the base filename, matching the single-export naming convention. */
export function batchFilenameBase(): string {
	return `Cartis-${state.city.replace(/\s+/g, '-')}`;
}
