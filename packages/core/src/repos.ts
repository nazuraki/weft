import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

/** Resolved `repos` config: repo identity (`org/repo`) → absolute checkout path. */
export type RepoMap = Map<string, string>;

/** `org/repo`: exactly two non-empty segments, no whitespace. */
export const REPO_IDENTITY = /^[^/\s]+\/[^/\s]+$/;

/**
 * Resolve the configured `repos` map to absolute checkout paths.
 *
 * `~` expands to the home directory here rather than being left to the shell,
 * because the value arrives from a YAML file no shell ever touches.
 */
export function resolveRepos(
	repos: Record<string, string> | undefined,
	rootDir: string
): RepoMap {
	const map: RepoMap = new Map();
	for (const [identity, path] of Object.entries(repos ?? {})) {
		const expanded =
			path === "~" || path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path;
		map.set(identity, isAbsolute(expanded) ? expanded : resolve(rootDir, expanded));
	}
	return map;
}

/** A GitHub blob URL, taken apart. */
export interface BlobUrl {
	/** Repo identity, `org/repo`. */
	repo: string;
	/** Path within the repo, URL-decoded. */
	path: string;
	/** Fragment including the leading `#`, when the URL carried one. */
	anchor?: string;
}

/**
 * Parse a GitHub blob URL into repo identity, in-repo path and fragment.
 *
 * Any `blob/<ref>/` segment is accepted — weft serves the working tree, so
 * which ref the URL claims is a validation question, not a resolution one. The
 * ref is taken to be a single path segment; a branch name containing `/` is
 * indistinguishable from the leading directories of the path in a blob URL, so
 * such a URL resolves to a path that exists in no docs root and stays an
 * ordinary external link.
 */
export function parseGitHubBlobUrl(url: string): BlobUrl | undefined {
	const match = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+\/[^/\s]+)\/blob\/[^/\s]+\/([^#\s]+)(#.+)?$/.exec(
		url
	);
	if (!match) return undefined;

	let path: string;
	try {
		path = decodeURIComponent(match[2]);
	} catch {
		return undefined;
	}

	return {
		repo: match[1],
		path,
		...(match[3] ? { anchor: match[3] } : {}),
	};
}
