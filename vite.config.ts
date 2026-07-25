import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		target: 'es2022',
		// poster export logic allocates very large canvases at runtime;
		// keep the bundle itself lean and let that happen in the browser, not here
		chunkSizeWarningLimit: 800,
	},
	server: {
		port: 5173,
	},
});
