import { WeftService, fetchRepo, loadConfig, resolveFetchedRepos } from "@lepid-labs/weft-core";
import { command } from "cleye";
import { openBrowser } from "../open-browser.js";
import { chooseUiMode, startBuiltServer, startDevServer } from "../ui-server.js";

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
				description: "Open the browser once the server is up",
				default: false,
			},
			dev: {
				type: Boolean,
				description:
					"Serve the UI from source through Vite with hot reload (needs a checkout of the weft repo)",
				default: false,
			},
			repo: {
				type: String,
				description: "Serve a GitHub repo (org/repo) without a checkout, fetching into a cache",
			},
			gh: {
				type: String,
				description: "Alias of --repo",
			},
			ref: {
				type: String,
				description: "Branch, tag or commit sha to fetch (with --repo; default: remote HEAD)",
			},
			refresh: {
				type: Boolean,
				description: "Re-resolve fetched refs even when the cached resolution is fresh",
				default: false,
			},
		},
	},
	async (argv) => {
		const port = argv.flags.port;

		const { createRequire } = await import("node:module");
		const { dirname, resolve } = await import("node:path");

		// Resolve @lepid-labs/weft-ui through node resolution rather than a path relative to
		// this file: the relative depth differs between src/ and dist/, and
		// `new URL(import.meta.url).pathname` keeps a leading slash before the
		// drive letter on Windows (`/C:/...`), which resolve() then mangles.
		const require = createRequire(import.meta.url);
		const uiRoot = dirname(require.resolve("@lepid-labs/weft-ui/package.json"));

		if (argv.flags.repo && argv.flags.gh && argv.flags.repo !== argv.flags.gh) {
			console.error("serve: --repo and --gh name different repos; pass one of them");
			process.exit(1);
		}
		const repo = argv.flags.repo ?? argv.flags.gh;
		if (repo && argv._.rootDir) {
			console.error("serve: pass either a root directory or --repo, not both");
			process.exit(1);
		}

		try {
			// Decide how the UI is served before fetching anything, so a missing
			// build fails fast rather than after a clone.
			const mode = chooseUiMode(uiRoot, argv.flags.dev);

			// With --repo the root is a fetched, cache-resident checkout; otherwise
			// resolve the root dir before the dev-mode chdir, since it defaults to the cwd.
			let rootDir: string;
			if (repo) {
				console.log(`Fetching ${repo}${argv.flags.ref ? `@${argv.flags.ref}` : ""}…`);
				rootDir = await fetchRepo(repo, {
					ref: argv.flags.ref,
					refresh: argv.flags.refresh,
				});
			} else {
				rootDir = resolve(argv._.rootDir ?? process.cwd());
			}

			// The CLI owns the single WeftService. The UI never constructs one — it
			// consumes /api JSON (client) and the manifest file (SSR).
			let config = await loadConfig(rootDir);
			if (repo) {
				// Repos the fetched config references resolve the same way: a real
				// local checkout wins, everything else is fetched at its HEAD.
				config = await resolveFetchedRepos(config, { refresh: argv.flags.refresh });
			}
			const service = new WeftService(config);

			await service.rebuild();
			await service.writeManifest();

			// SvelteKit's server loads read the manifest file from this path — SSR
			// cannot reach the /api handler through SvelteKit's internal fetch.
			process.env.WEFT_MANIFEST_PATH = service.manifestPath;

			const server =
				mode === "built"
					? await startBuiltServer(service, uiRoot, port)
					: await startDevServer(service, uiRoot, port);
			const url = `http://localhost:${port}`;
			console.log(`Weft server running at ${url}${mode === "dev" ? " (vite dev)" : ""}`);
			if (argv.flags.open) openBrowser(url);

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
