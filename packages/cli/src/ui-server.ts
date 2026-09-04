import { existsSync } from "node:fs";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { WeftService } from "@weft/core";
import { handleApiRequest, weftApiPlugin } from "./api-middleware.js";

/** Where the UI comes from: the adapter-node build, or Vite over the source tree. */
export type UiMode = "built" | "dev";

/** The connect-style handler `@sveltejs/adapter-node` exports from `build/handler.js`. */
export type UiHandler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

/** The adapter-node entry point, relative to the `@weft/ui` package root. */
export const BUILT_HANDLER = join("build", "handler.js");

/**
 * Pick how to serve the UI. The build wins when it exists — it is what a
 * published package ships and what `npx` runs — and the source tree is the
 * fallback for a checkout of this repo that has not built it. `forceDev`
 * (`--dev`) is for working on the UI itself: hot reload, at Vite's startup cost.
 */
export function chooseUiMode(uiRoot: string, forceDev: boolean): UiMode {
	const hasBuild = existsSync(join(uiRoot, BUILT_HANDLER));
	const hasSource = existsSync(join(uiRoot, "svelte.config.js"));
	if (forceDev) {
		if (!hasSource) {
			throw new Error(`serve: --dev needs the @weft/ui source tree, and ${uiRoot} has none`);
		}
		return "dev";
	}
	if (hasBuild) return "built";
	if (hasSource) return "dev";
	throw new Error(
		`serve: no UI found in ${uiRoot} — expected ${BUILT_HANDLER} (run \`pnpm --filter @weft/ui build\`)`
	);
}

/**
 * Route one request: `/api…` to the data API with the mount point stripped —
 * exactly as Vite's `use("/api", …)` strips it, so both modes share one
 * handler — and everything else to the UI.
 */
export function routeRequest(service: WeftService, ui: UiHandler) {
	return (req: IncomingMessage, res: ServerResponse): void => {
		const url = req.url ?? "/";
		if (url === "/api" || url.startsWith("/api/") || url.startsWith("/api?")) {
			const rest = url.slice("/api".length);
			req.url = rest === "" || rest.startsWith("?") ? `/${rest}` : rest;
			handleApiRequest(service, req, res).catch((err: unknown) => {
				console.error("API error:", err);
				if (!res.headersSent) {
					res.statusCode = 500;
					res.setHeader("Content-Type", "application/json");
				}
				res.end(JSON.stringify({ error: "Internal server error" }));
			});
			return;
		}
		ui(req, res, () => {
			res.statusCode = 404;
			res.end("Not found");
		});
	};
}

export interface RunningServer {
	close(): void;
}

/** Serve the adapter-node build over plain `node:http`, the API in front of it. */
export async function startBuiltServer(
	service: WeftService,
	uiRoot: string,
	port: number
): Promise<RunningServer> {
	const entry = pathToFileURL(join(uiRoot, BUILT_HANDLER)).href;
	const { handler } = (await import(entry)) as { handler: UiHandler };
	const server = createServer(routeRequest(service, handler));
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, () => {
			server.off("error", reject);
			resolve();
		});
	});
	return { close: () => void server.close() };
}

/** Serve the UI source through Vite's dev server, with the API as a plugin. */
export async function startDevServer(
	service: WeftService,
	uiRoot: string,
	port: number
): Promise<RunningServer> {
	const { createServer: createViteServer } = await import("vite");
	// SvelteKit's Vite plugin overrides Vite's `root` option with process.cwd()
	// and looks up svelte.config.js and src/app.html there, so passing `root`
	// alone is not enough — the process has to run from the UI package.
	process.chdir(uiRoot);
	const server = await createViteServer({
		root: uiRoot,
		server: { port },
		plugins: [weftApiPlugin(service)],
	});
	await server.listen();
	return { close: () => void server.close() };
}
