import { command } from 'cleye';
import { loadConfig, WeftService } from '@weft/core';

export const serveCommand = command({
	name: 'serve',
	help: {
		description: 'Start the Weft UI server'
	},
	parameters: ['[root-dir]'],
	flags: {
		port: {
			type: Number,
			description: 'Port to serve on',
			default: 7777
		},
		open: {
			type: Boolean,
			description: 'Open browser on start',
			default: true
		}
	}
}, async (argv) => {
	const port = argv.flags.port;

	const { createServer } = await import('vite');
	const { resolve } = await import('node:path');
	const uiRoot = resolve(new URL(import.meta.url).pathname, '../../../ui');

	// Set WEFT_ROOT_DIR before creating the Vite server so the weft-config-loader
	// plugin (in vite.config.ts) can find the user's config and set WEFT_CONFIG.
	const rootDir = resolve(argv._.rootDir ?? process.cwd());
	process.env.WEFT_ROOT_DIR = rootDir;

	// Start the SvelteKit dev server — the weft-config-loader plugin runs in
	// configureServer and populates WEFT_CONFIG from the user's weft.config.ts.
	try {
		const server = await createServer({
			root: uiRoot,
			server: { port }
		});

		// Config is now in WEFT_CONFIG (set by the Vite plugin above).
		const config = await loadConfig(rootDir);
		const service = new WeftService(config);

		await service.rebuild();
		await service.writeManifest();

		await server.listen();
		console.log(`Weft server running at http://localhost:${port}`);

		// Watch for doc changes
		const unwatch = service.watch(async (manifest) => {
			console.log(`Rebuilt: ${manifest.nodes.length} docs, ${manifest.edges.length} edges`);
			await service.writeManifest();
		});

		// Graceful shutdown
		const shutdown = () => {
			unwatch();
			server.close();
			process.exit(0);
		};
		process.on('SIGINT', shutdown);
		process.on('SIGTERM', shutdown);
	} catch (err) {
		console.error('Failed to start server:', err);
		process.exit(1);
	}
});
