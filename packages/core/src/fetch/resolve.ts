import { existsSync } from "node:fs";
import { REPO_IDENTITY, resolveRepos } from "../repos.js";
import type { WeftConfig } from "../types.js";
import { resolveToken } from "./auth.js";
import { readCachedSha, repoCacheDir, writeCachedSha } from "./cache.js";
import { cloneAtSha, githubUrl, resolveRemoteRef } from "./clone.js";

/** How a fetch run resolves refs, credentials and cache placement. */
export interface FetchOptions {
	/** Ref to fetch — branch, tag or full sha. Defaults to the remote HEAD. */
	ref?: string;
	/** Re-resolve refs even when a cached resolution is still fresh. */
	refresh?: boolean;
	/** Token to authenticate with. Undefined means resolve one; "" means none. */
	token?: string;
	/** Clone URL per identity. A test seam; defaults to github.com HTTPS. */
	urlFor?: (identity: string) => string;
	/** Environment for cache placement and token lookup. Defaults to process.env. */
	env?: NodeJS.ProcessEnv;
}

/**
 * Fetch a repo into the cache and return the checkout's absolute path.
 *
 * Resolution is remembered per ref (with a TTL for branches) and the clone is
 * keyed by commit sha, so repeated serves of an unmoved ref cost one
 * `ls-remote` at most and no clone.
 */
export async function fetchRepo(identity: string, opts: FetchOptions = {}): Promise<string> {
	if (!REPO_IDENTITY.test(identity)) {
		throw new Error(`weft fetch: "${identity}" is not a repo identity of the form "org/repo"`);
	}
	const env = opts.env ?? process.env;
	const token = opts.token ?? (await resolveToken(env));
	const url = (opts.urlFor ?? githubUrl)(identity);
	const ref = opts.ref ?? "HEAD";

	let sha = opts.refresh ? undefined : readCachedSha(identity, ref, env);
	if (!sha) {
		const resolved = await resolveRemoteRef(url, opts.ref, token);
		sha = resolved.sha;
		writeCachedSha(identity, ref, sha, resolved.movable, env);
	}

	const dir = repoCacheDir(identity, sha, env);
	await cloneAtSha(url, sha, dir, token);
	return dir;
}

/**
 * Fill the gaps in `config.repos` by fetching, and return the config with the
 * fetched checkout paths in place.
 *
 * A repo mapped to a real local path keeps winning — fetching is the fallback,
 * not the override — so someone with three of five repos checked out reads
 * their local working trees for those three and fetched copies of the rest.
 * Referenced repos are fetched at their remote HEAD; a ref in `opts` names a
 * ref of the primary repo, not of everything it references.
 */
export async function resolveFetchedRepos(
	config: WeftConfig,
	opts: FetchOptions = {}
): Promise<WeftConfig> {
	const needed = new Set<string>(Object.keys(config.repos ?? {}));
	for (const project of config.projects ?? []) {
		if (project.repo !== undefined) needed.add(project.repo);
	}

	const local = resolveRepos(config.repos, config.rootDir);
	const repos = { ...config.repos };
	let changed = false;
	for (const identity of needed) {
		const checkout = local.get(identity);
		if (checkout && existsSync(checkout)) continue;
		repos[identity] = await fetchRepo(identity, { ...opts, ref: undefined });
		changed = true;
	}
	return changed ? { ...config, repos } : config;
}
