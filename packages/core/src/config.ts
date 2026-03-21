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
