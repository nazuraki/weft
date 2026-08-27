import { execFile } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { gitAuthEnv } from "./auth.js";

const exec = promisify(execFile);

/** A full object id, which needs no ls-remote to resolve. */
const FULL_SHA = /^[0-9a-f]{40}$/;

/**
 * Marks a cache entry whose clone ran to completion. Written last, so an
 * interrupted clone leaves a directory that reads as absent and is redone.
 */
const COMPLETE_MARKER = "weft-complete";

/** The HTTPS clone URL for a repo identity. */
export function githubUrl(identity: string): string {
	return `https://github.com/${identity}.git`;
}

async function git(args: string[], token: string | undefined): Promise<string> {
	const { stdout } = await exec("git", args, {
		windowsHide: true,
		// Never prompt for credentials — fail instead, so the error below can say
		// what to set.
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...gitAuthEnv(token) },
	});
	return stdout;
}

/**
 * GitHub reports a private repo it will not serve exactly as it reports a repo
 * that does not exist, so the error has to say both.
 */
function fetchError(what: string, token: string | undefined, cause: unknown): Error {
	const stderr = (cause as { stderr?: string })?.stderr?.trim();
	return new Error(
		[
			`weft fetch: could not fetch ${what} — the repository was not found, or you do not have access.`,
			token
				? "A token was supplied; check that it can read this repository."
				: "For a private repository, set GH_TOKEN or GITHUB_TOKEN, or run `gh auth login`.",
			...(stderr ? [stderr] : []),
		].join("\n")
	);
}

/** A resolved remote ref. `movable` is true when it named a branch (or HEAD). */
export interface ResolvedRef {
	sha: string;
	movable: boolean;
}

/**
 * Resolve a ref to a commit sha with `ls-remote`. No ref means the remote HEAD.
 * A full sha resolves to itself without touching the network.
 */
export async function resolveRemoteRef(
	url: string,
	ref: string | undefined,
	token?: string
): Promise<ResolvedRef> {
	if (ref && FULL_SHA.test(ref)) return { sha: ref, movable: false };

	const patterns = ref ? [ref, `${ref}^{}`] : ["HEAD"];
	let stdout: string;
	try {
		stdout = await git(["ls-remote", url, ...patterns], token);
	} catch (err) {
		throw fetchError(ref ? `${url} at "${ref}"` : url, token, err);
	}

	const lines = stdout
		.split("\n")
		.filter(Boolean)
		.map((line) => line.split("\t") as [string, string]);
	if (lines.length === 0) {
		throw fetchError(`${url} at "${ref ?? "HEAD"}" (no such ref)`, token, undefined);
	}

	const byName = new Map(lines.map(([sha, name]) => [name, sha]));
	const branch = ref ? byName.get(`refs/heads/${ref}`) : byName.get("HEAD");
	// The peeled entry first: an annotated tag's own sha is not a commit.
	const sha =
		branch ??
		byName.get(`refs/tags/${ref}^{}`) ??
		byName.get(`refs/tags/${ref}`) ??
		byName.get(ref as string) ??
		lines[0][0];
	return { sha, movable: branch !== undefined };
}

/**
 * Materialize a repo at a commit into `dir` as a blobless partial clone.
 *
 * `--filter=blob:none` keeps every commit and tree, so `git log` — and with it
 * every `modified` date and history-reading rule — answers exactly as it would
 * over a full checkout; only file content is fetched on demand at checkout.
 * A tarball would be smaller and silently date-less, the failure mode the
 * issue tracker calls out.
 *
 * Idempotent per directory: a completed clone is reused, an interrupted one
 * is discarded and redone.
 */
export async function cloneAtSha(
	url: string,
	sha: string,
	dir: string,
	token?: string
): Promise<void> {
	if (existsSync(join(dir, ".git", COMPLETE_MARKER))) return;

	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dirname(dir), { recursive: true });
	try {
		await git(["init", "-q", dir], token);
		await git(["-C", dir, "remote", "add", "origin", url], token);
		// Fetching the sha itself (GitHub allows reachable-sha-in-want) rather
		// than a ref name, so the checkout is exactly what ls-remote resolved
		// even if the branch has moved since.
		await git(["-C", dir, "fetch", "-q", "--filter=blob:none", "origin", sha], token);
		await git(["-C", dir, "-c", "advice.detachedHead=false", "checkout", "-q", sha], token);
	} catch (err) {
		rmSync(dir, { recursive: true, force: true });
		throw fetchError(`${url} at ${sha}`, token, err);
	}
	writeFileSync(join(dir, ".git", COMPLETE_MARKER), "");
}
