import { nodeIdFor, resolveDocsRoots } from "../config.js";
import { fileHistory } from "../git.js";
import type { WeftConfig } from "../types.js";
import type { GraphHistory } from "./types.js";

/** A history that knows nothing, for when git cannot answer or nothing asked. */
export const NO_HISTORY: GraphHistory = { blobs: new Map(), renames: new Map() };

/**
 * Gather what git knows about every docs root, translated into node ids.
 *
 * Namespacing happens here, once, rather than in each check: git reports paths
 * relative to the root it was run in, and a multi-project graph identifies the
 * same file as `alpha/guide.md`. A check comparing raw paths would silently
 * conflate two projects' identically named documents.
 */
export async function graphHistory(config: WeftConfig): Promise<GraphHistory> {
	const blobs = new Map<string, Set<string>>();
	const renames = new Map<string, string>();

	for (const root of resolveDocsRoots(config)) {
		const history = await fileHistory(root.absDir);

		for (const [path, held] of history.blobs) {
			const id = nodeIdFor(root, path);
			const existing = blobs.get(id);
			if (existing) for (const blob of held) existing.add(blob);
			else blobs.set(id, new Set(held));
		}

		for (const [from, to] of history.renames) {
			renames.set(nodeIdFor(root, from), nodeIdFor(root, to));
		}
	}

	return { blobs, renames };
}
