import { jsPDF } from 'jspdf';
import { composePosterCanvas } from './png-export';
import { state } from '../core/store';
import { DEFAULT_EXPORT_DPI, pxToIn } from '../core/units';

/**
 * Exports the current poster as a PDF. This embeds a raster PNG of the
 * full composition — MapLibre/Leaflet output has no vector export path,
 * so a genuinely vector PDF isn't possible here. The PDF page is sized to
 * match the poster's physical dimensions at the configured export DPI, so
 * it prints at the correct physical size rather than being an arbitrary
 * page size with the image stretched to fit.
 */
export async function exportToPDF(filename: string, statusElement: HTMLElement | null): Promise<void> {
	if (statusElement) statusElement.classList.remove('hidden');

	try {
		const canvas = await composePosterCanvas();
		const dpi = state.exportDpi || DEFAULT_EXPORT_DPI;
		const widthIn = pxToIn(canvas.width, dpi);
		const heightIn = pxToIn(canvas.height, dpi);

		const pdf = new jsPDF({
			orientation: widthIn >= heightIn ? 'landscape' : 'portrait',
			unit: 'in',
			format: [widthIn, heightIn],
			compress: true,
		});

		const dataUrl = canvas.toDataURL('image/jpeg', 0.95); // JPEG keeps PDF file size sane at poster resolutions; PNG's lossless win rarely matters after print
		pdf.addImage(dataUrl, 'JPEG', 0, 0, widthIn, heightIn);
		pdf.save(filename);
	} catch (error) {
		console.error('PDF export failed:', error);
		alert('PDF export failed. Please try again.');
	} finally {
		if (statusElement) statusElement.classList.add('hidden');
	}
}
