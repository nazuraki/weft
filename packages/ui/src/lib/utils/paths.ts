import type { WeftNode } from "@lepid-labs/weft-core";

const DOC_EXT = /\.(md|markdown|yaml|yml|json)$/;

/**
 * Map a node id to its URL path. A README is addressed by its directory, so
 * `README.md` is `/` and a project's `alpha/README.md` is `/alpha`.
 */
export function nodeIdToPath(nodeId: string): string {
	const withoutExt = nodeId.replace(DOC_EXT, "");
	const trimmed = withoutExt.replace(/(^|\/)README$/, "");
	return trimmed === "" ? "/" : `/${trimmed}`;
}

export function pathToNode(path: string, nodes: WeftNode[]): WeftNode | undefined {
	const normalized = (path ?? "").replace(/^\//, "").replace(/\/$/, "");
	const candidates = normalized === "" ? ["README"] : [normalized, `${normalized}/README`];

	for (const candidate of candidates) {
		const node = nodes.find((n) => n.id.replace(DOC_EXT, "") === candidate);
		if (node) return node;
	}
	return undefined;
}
