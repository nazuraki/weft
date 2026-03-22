import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import type { WeftConfig } from './types.js';

const CONFIG_FILES = ['weft.config.ts', 'weft.config.js', 'weft.config.mjs'];

const DEFAULTS: Omit<WeftConfig, 'rootDir'> = {
	docsDir: 'docs',
	entryPoint: 'docs/README.md',
	ignore: ['**/node_modules/**', '**/dist/**']
};

export function defineConfig(config: Partial<Omit<WeftConfig, 'rootDir'>>): Partial<Omit<WeftConfig, 'rootDir'>> {
	return config;
}

export async function loadConfig(rootDir: string): Promise<WeftConfig> {
	// When the Vite plugin (or CLI serve command) has already resolved the config
	// via ssrLoadModule, it stores the result here to avoid re-executing the TS
	// config file (which would fail due to pnpm's strict node_modules isolation).
	if (process.env.WEFT_CONFIG) {
		return JSON.parse(process.env.WEFT_CONFIG) as WeftConfig;
	}

	const absRoot = resolve(rootDir);

	for (const file of CONFIG_FILES) {
		const configPath = resolve(absRoot, file);
		if (existsSync(configPath)) {
			const url = pathToFileURL(configPath).href;
			const mod = await import(url);
			const userConfig = mod.default ?? mod;
			return {
				...DEFAULTS,
				...userConfig,
				rootDir: absRoot
			};
		}
	}

	return { ...DEFAULTS, rootDir: absRoot };
}
