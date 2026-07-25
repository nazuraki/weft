import type { Manifest } from "./types.js";

/**
 * Map a node id to its path relative to the project root.
 *
 * In multi-project mode ids are namespaced by project slug (`alpha/api.md`),
 * which is not where the file lives — this resolves it back through the
 * project's `docsDir` (`products/alpha/docs/api.md`). Bare ids pass through
 * unchanged, so single-project consumers see no difference.
 *
 * Browser-safe: pure string manipulation, no filesystem access.
 */
export function nodeIdToDocPath(manifest: Manifest, nodeId: string): string {
	for (const project of manifest.projects ?? []) {
		if (nodeId.startsWith(`${project.slug}/`)) {
			const rest = nodeId.slice(project.slug.length + 1);
			const dir = project.docsDir.replace(/\/+$/, "");
			return dir ? `${dir}/${rest}` : rest;
		}
	}
	return nodeId;
}
