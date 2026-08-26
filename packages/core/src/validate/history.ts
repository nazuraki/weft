import { type DocsRoot, nodeIdFor, resolveDocsRoots } from "../config.js";
import { type FileHistory, fileHistory } from "../git.js";
import type { WeftConfig } from "../types.js";
import type { GraphHistory } from "./types.js";

/** A history that knows nothing, for when git cannot answer or nothing asked. */
export const NO_HISTORY: GraphHistory = { blobs: new Map(), renames: new Map() };

/**
 * Combine per-root walks into one graph-wide history, translated into node ids.
 *
 * Namespacing happens here, once, rather than in each check: git reports paths
 * relative to the root it was run in, and a multi-project graph identifies the
 * same file as `alpha/guide.md`. A check comparing raw paths would silently
 * conflate two projects' identically named documents.
 */
export function graphHistoryFrom(walks: Iterable<[DocsRoot, FileHistory]>): GraphHistory {
	const blobs = new Map<string, Set<string>>();
	const renames = new Map<string, string>();

	for (const [root, history] of walks) {
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

/**
 * Gather what git knows about every docs root, walking each root's history.
 *
 * The service shares an already-paid walk via {@link graphHistoryFrom}
 * instead; this stands alone for callers that have nothing to share.
 */
export async function graphHistory(config: WeftConfig): Promise<GraphHistory> {
	const walks: [DocsRoot, FileHistory][] = [];
	for (const root of resolveDocsRoots(config)) {
		walks.push([root, await fileHistory(root.absDir)]);
	}
	return graphHistoryFrom(walks);
}
