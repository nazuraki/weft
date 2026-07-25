import { WeftService, loadConfig } from "@weft/core";
import { command } from "cleye";
import { weftApiPlugin } from "../api-middleware.js";

export const serveCommand = command(
	{
		name: "serve",
		help: {
			description: "Start the Weft UI server",
		},
		parameters: ["[root-dir]"],
		flags: {
			port: {
				type: Number,
				description: "Port to serve on",
				default: 7777,
			},
			open: {
				type: Boolean,
				description: "Open browser on start",
				default: true,
			},
		},
	},
	async (argv) => {
		const port = argv.flags.port;

		const { createServer } = await import("vite");
		const { createRequire } = await import("node:module");
		const { dirname, resolve } = await import("node:path");

		// Resolve @weft/ui through node resolution rather than a path relative to
		// this file: the relative depth differs between src/ and dist/, and
		// `new URL(import.meta.url).pathname` keeps a leading slash before the
		// drive letter on Windows (`/C:/...`), which resolve() then mangles.
		const require = createRequire(import.meta.url);
		const uiRoot = dirname(require.resolve("@weft/ui/package.json"));

		// Resolve the root dir before the chdir below, since it defaults to the cwd.
		const rootDir = resolve(argv._.rootDir ?? process.cwd());

		try {
			// The CLI owns the single WeftService. The UI never constructs one — it
			// consumes /api JSON (client) and the manifest file (SSR).
			const config = await loadConfig(rootDir);
			const service = new WeftService(config);

			await service.rebuild();
			await service.writeManifest();

			// SvelteKit's server loads read the manifest file from this path — SSR
			// cannot reach the /api middleware through SvelteKit's internal fetch.
			process.env.WEFT_MANIFEST_PATH = service.manifestPath;

			// SvelteKit's Vite plugin overrides Vite's `root` option with process.cwd()
			// and looks up svelte.config.js and src/app.html there, so passing `root`
			// alone is not enough — the process has to run from the UI package.
			process.chdir(uiRoot);

			const server = await createServer({
				root: uiRoot,
				server: { port },
				plugins: [weftApiPlugin(service)],
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
			process.on("SIGINT", shutdown);
			process.on("SIGTERM", shutdown);
		} catch (err) {
			console.error("Failed to start server:", err);
			process.exit(1);
		}
	}
);
