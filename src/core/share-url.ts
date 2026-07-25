import type { CartisState } from '../types/state';
import { SAVED_KEYS } from '../types/state';

const QUERY_PARAM = 'state';

function base64UrlEncode(bytes: Uint8Array): string {
	let binary = '';
	bytes.forEach((b) => (binary += String.fromCharCode(b)));
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): Uint8Array {
	const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function pickSavedFields(s: CartisState): Partial<CartisState> {
	const out: Record<string, unknown> = {};
	for (const key of SAVED_KEYS) {
		out[key] = s[key];
	}
	return out as Partial<CartisState>;
}

/** Builds the full shareable URL for the current page with the compressed state attached as a query param. */
export async function buildShareURL(currentState: CartisState): Promise<string> {
	const json = JSON.stringify(pickSavedFields(currentState));
	const url = new URL(window.location.href);
	url.search = '';

	if (typeof CompressionStream !== 'undefined') {
		try {
			const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
			const buf = await new Response(stream).arrayBuffer();
			url.searchParams.set(QUERY_PARAM, 'gz.' + base64UrlEncode(new Uint8Array(buf)));
			return url.toString();
		} catch {
			/* fall through to uncompressed encoding below */
		}
	}

	url.searchParams.set(QUERY_PARAM, 'raw.' + base64UrlEncode(new TextEncoder().encode(json)));
	return url.toString();
}

/** Reads and decodes the state query param from the current URL, if present. Returns null if absent or unparseable — caller should treat that as "nothing to load", not an error. */
export async function readStateFromURL(): Promise<Partial<CartisState> | null> {
	const raw = new URLSearchParams(window.location.search).get(QUERY_PARAM);
	if (!raw) return null;

	const dotIndex = raw.indexOf('.');
	if (dotIndex === -1) return null;
	const tag = raw.slice(0, dotIndex);
	const data = raw.slice(dotIndex + 1);

	try {
		const bytes = base64UrlDecode(data);
		if (tag === 'gz') {
			if (typeof DecompressionStream === 'undefined') return null;
			const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
			const buf = await new Response(stream).arrayBuffer();
			return JSON.parse(new TextDecoder().decode(buf)) as Partial<CartisState>;
		}
		return JSON.parse(new TextDecoder().decode(bytes)) as Partial<CartisState>;
	} catch (e) {
		console.error('Failed to decode shared state from URL:', e);
		return null;
	}
}
