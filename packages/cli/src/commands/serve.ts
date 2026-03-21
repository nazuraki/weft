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
	const rootDir = argv._.rootDir ?? process.cwd();
	const config = await loadConfig(rootDir);
	const service = new WeftService(config);

	// Build initial manifest
	await service.rebuild();
	await service.writeManifest();

	const port = argv.flags.port;

	// Pass root dir via env so the SvelteKit server-side can find the config
	process.env.WEFT_ROOT_DIR = rootDir;

	// Start the SvelteKit dev server
	try {
		const { createServer } = await import('vite');
		const { resolve } = await import('node:path');
		const uiRoot = resolve(new URL(import.meta.url).pathname, '../../../ui');
		const server = await createServer({
			root: uiRoot,
			server: { port }
		});

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
