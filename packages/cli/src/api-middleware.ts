import type { IncomingMessage, ServerResponse } from "node:http";
import type { WeftService } from "@lepid-labs/weft-core";
import type { Plugin } from "vite";

/**
 * The data API for the Weft UI, served by the CLI's Vite server and closing
 * over the single WeftService instance. The UI never constructs a service —
 * it consumes these JSON endpoints (and the manifest file during SSR).
 */
export function weftApiPlugin(service: WeftService): Plugin {
	return {
		name: "weft-api",
		configureServer(server) {
			server.middlewares.use("/api", (req, res, next) => {
				handleApiRequest(service, req, res).catch((err) => next(err));
			});
		},
	};
}

/** Handle one /api request. The url is relative to the /api mount point. */
export async function handleApiRequest(
	service: WeftService,
	req: IncomingMessage,
	res: ServerResponse
): Promise<void> {
	const url = new URL(req.url ?? "/", "http://weft.local");
	const path = url.pathname;

	if (path === "/manifest") {
		return json(res, 200, await service.getManifest());
	}

	if (path.startsWith("/doc/")) {
		const nodeId = decodeURIComponent(path.slice("/doc/".length));
		try {
			return json(res, 200, { content: service.read(nodeId) });
		} catch {
			return json(res, 404, { error: `Document not found: ${nodeId}` });
		}
	}

	if (path === "/search") {
		const query = url.searchParams.get("q");
		if (!query) return json(res, 400, { error: 'Missing query parameter "q"' });
		return json(res, 200, await service.search(query));
	}

	if (path === "/traverse") {
		const nodeId = url.searchParams.get("node");
		if (!nodeId) return json(res, 400, { error: 'Missing query parameter "node"' });
		const direction = (url.searchParams.get("direction") ?? "both") as
			| "outgoing"
			| "incoming"
			| "both";
		return json(res, 200, await service.traverse(nodeId, direction));
	}

	return json(res, 404, { error: `Unknown API route: ${path}` });
}

function json(res: ServerResponse, status: number, body: unknown): void {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json");
	res.end(JSON.stringify(body));
}
