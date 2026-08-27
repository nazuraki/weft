import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

/**
 * How long a branch's ref→sha resolution is trusted before `ls-remote` runs
 * again. A sha or tag record never expires — the clone it names cannot change.
 */
export const REF_TTL_MS = 15 * 60 * 1000;

/**
 * Root of the fetch cache: `WEFT_CACHE_DIR`, else `$XDG_CACHE_HOME/weft`,
 * else `~/.cache/weft`.
 */
export function cacheRoot(env: NodeJS.ProcessEnv = process.env): string {
	if (env.WEFT_CACHE_DIR) return resolve(env.WEFT_CACHE_DIR);
	const base = env.XDG_CACHE_HOME ? resolve(env.XDG_CACHE_HOME) : join(homedir(), ".cache");
	return join(base, "weft");
}

/**
 * Where a fetched repo lands, keyed by resolved commit sha so a moved branch
 * invalidates cleanly: `<cache>/github.com/<org>/<repo>/<sha>`.
 */
export function repoCacheDir(
	identity: string,
	sha: string,
	env: NodeJS.ProcessEnv = process.env
): string {
	return join(cacheRoot(env), "github.com", identity, sha);
}

/**
 * True when a path lies inside the fetch cache — a fetched checkout, which is
 * read-only by construction and never worth watching for edits.
 */
export function isCachePath(absPath: string, env: NodeJS.ProcessEnv = process.env): boolean {
	const rel = relative(cacheRoot(env), resolve(absPath));
	return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** One remembered ref resolution. `movable` is true for a branch (and HEAD). */
interface RefRecord {
	sha: string;
	resolvedAt: string;
	movable: boolean;
}

function refRecordPath(identity: string, env: NodeJS.ProcessEnv): string {
	return join(cacheRoot(env), "github.com", identity, "refs.json");
}

function readRecords(path: string): Record<string, RefRecord> {
	if (!existsSync(path)) return {};
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
		return parsed as Record<string, RefRecord>;
	} catch {
		// An unreadable record only costs one ls-remote.
		return {};
	}
}

/** The remembered sha for a ref, or undefined when there is none or it has aged out. */
export function readCachedSha(
	identity: string,
	ref: string,
	env: NodeJS.ProcessEnv = process.env
): string | undefined {
	const record = readRecords(refRecordPath(identity, env))[ref];
	if (!record?.sha) return undefined;
	if (record.movable && Date.now() - Date.parse(record.resolvedAt) > REF_TTL_MS) return undefined;
	return record.sha;
}

/** Remember a ref resolution for {@link readCachedSha}. */
export function writeCachedSha(
	identity: string,
	ref: string,
	sha: string,
	movable: boolean,
	env: NodeJS.ProcessEnv = process.env
): void {
	const path = refRecordPath(identity, env);
	const records = readRecords(path);
	records[ref] = { sha, resolvedAt: new Date().toISOString(), movable };
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(records, null, 2));
}
