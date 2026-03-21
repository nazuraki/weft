import { command } from 'cleye';
import { loadConfig, WeftService } from '@weft/core';

export const indexCommand = command({
	name: 'index',
	help: {
		description: 'Rebuild the graph manifest from embedded links'
	},
	parameters: ['[root-dir]'],
	flags: {
		quiet: {
			type: Boolean,
			description: 'Suppress output',
			default: false
		}
	}
}, async (argv) => {
	const rootDir = argv._.rootDir ?? process.cwd();
	const config = await loadConfig(rootDir);
	const service = new WeftService(config);

	const manifest = await service.rebuild();
	const outPath = await service.writeManifest();

	if (!argv.flags.quiet) {
		console.log(`Indexed ${manifest.nodes.length} documents, ${manifest.edges.length} edges`);
		console.log(`Manifest written to ${outPath}`);
	}
});
