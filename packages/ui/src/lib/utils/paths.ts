import type { WeftNode } from "@weft/core";

const DOC_EXT = /\.(md|markdown|yaml|yml|json)$/;

export function nodeIdToPath(nodeId: string): string {
	const withoutExt = nodeId.replace(DOC_EXT, "");
	return withoutExt === "README" ? "/" : `/${withoutExt}`;
}

export function pathToNode(path: string, nodes: WeftNode[]): WeftNode | undefined {
	const normalized = (path ?? "").replace(/^\//, "") || "README";
	return nodes.find((n) => n.id.replace(DOC_EXT, "") === normalized);
}
