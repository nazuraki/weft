import { loadConfig, WeftService } from '@weft/core';

let service: WeftService | null = null;

export async function getService(): Promise<WeftService> {
	if (service) return service;

	// The root dir is passed via env var from the CLI serve command,
	// or defaults to CWD
	const rootDir = process.env.WEFT_ROOT_DIR ?? process.cwd();
	const config = await loadConfig(rootDir);
	service = new WeftService(config);
	await service.rebuild();
	return service;
}
