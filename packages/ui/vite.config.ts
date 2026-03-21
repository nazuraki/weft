import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	ssr: {
		// Bundle @weft/core into SSR since it's a workspace package with TypeScript sources
		noExternal: ['@weft/core']
	}
});
