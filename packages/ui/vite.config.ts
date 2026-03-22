import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { Plugin } from 'vite';

const CONFIG_FILES = ['weft.config.ts', 'weft.config.js', 'weft.config.mjs'];
const DEFAULTS = {
	docsDir: 'docs',
	entryPoint: 'docs/README.md',
	ignore: ['**/node_modules/**', '**/dist/**']
};

/**
 * Loads the user's weft config via Vite's ssrLoadModule so that workspace
 * package imports (e.g. `@weft/core`) resolve correctly even though they are
 * not present in the project root's node_modules (pnpm strict isolation).
 * The resolved config is stored as JSON in WEFT_CONFIG so that getService()
 * can read it without re-executing the TypeScript config file.
 */
function weftConfigLoader(): Plugin {
	return {
		name: 'weft-config-loader',
		async configureServer(server) {
			if (process.env.WEFT_CONFIG) return; // already set by CLI

			const rootDir = resolve(process.env.WEFT_ROOT_DIR ?? process.cwd());
			let resolvedConfig = { ...DEFAULTS, rootDir };

			for (const file of CONFIG_FILES) {
				const configPath = resolve(rootDir, file);
				if (!existsSync(configPath)) continue;
				try {
					const mod = await server.ssrLoadModule(configPath);
					const userConfig = mod.default ?? mod;
					resolvedConfig = { ...resolvedConfig, ...userConfig, rootDir };
				} catch (e) {
					console.warn(`[weft] Failed to load ${file}:`, e);
				}
				break;
			}

			process.env.WEFT_CONFIG = JSON.stringify(resolvedConfig);
		}
	};
}

export default defineConfig({
	plugins: [sveltekit(), weftConfigLoader()],
	resolve: {
		alias: {
			'@weft/core': resolve(__dirname, '../../packages/core/src/index.ts')
		}
	},
	ssr: {
		// Bundle @weft/core into SSR since it's a workspace package with TypeScript sources
		noExternal: ['@weft/core']
	}
});
