import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lastCommitDates } from "../git.js";
import { buildManifest } from "../manifest.js";
import type { WeftConfig } from "../types.js";
import { repoCacheDir } from "./cache.js";
import { cloneAtSha, resolveRemoteRef } from "./clone.js";
import { fetchRepo, resolveFetchedRepos } from "./resolve.js";

/**
 * The whole fetch path against a local `file://` remote: ref resolution,
 * blobless cloning with history intact, cache reuse, and filling a config's
 * `repos` gaps by fetching — with a real local checkout still winning.
 */

const COMMIT_DATE = "2026-03-04T00:00:00+00:00";

let workspace: string;
let remote: string;
let remoteUrl: string;
let cacheDir: string;
let env: NodeJS.ProcessEnv;
let headSha: string;

/** file:// transport, no token, cache under the workspace. */
const opts = () => ({ token: "", urlFor: () => remoteUrl, env });

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "weft-fetch-"));
	cacheDir = join(workspace, "cache");
	env = { WEFT_CACHE_DIR: cacheDir };

	remote = join(workspace, "remote");
	mkdirSync(join(remote, "docs"), { recursive: true });
	writeFileSync(join(remote, "docs", "README.md"), "# Fetched\n\n[Guide](guide.md)\n");
	writeFileSync(join(remote, "docs", "guide.md"), "# Guide\n");
	writeFileSync(join(remote, "weft.config.yaml"), "docsDir: docs\n");

	git(remote, "init", "-q");
	git(remote, "config", "user.email", "test@example.com");
	git(remote, "config", "user.name", "Test");
	git(remote, "config", "commit.gpgsign", "false");
	// What GitHub's servers allow: partial clones, and fetching by sha.
	git(remote, "config", "uploadpack.allowFilter", "true");
	git(remote, "config", "uploadpack.allowReachableSHA1InWant", "true");
	git(remote, "add", "-A");
	git(remote, "commit", "-q", "-m", "init", "--date", COMMIT_DATE);
	git(remote, "tag", "-a", "v1", "-m", "v1");
	headSha = git(remote, "rev-parse", "HEAD");
	remoteUrl = pathToFileURL(remote).href;
});

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

describe("resolveRemoteRef", () => {
	it("resolves HEAD when no ref is given, as movable", async () => {
		await expect(resolveRemoteRef(remoteUrl, undefined)).resolves.toEqual({
			sha: headSha,
			movable: true,
		});
	});

	it("resolves a branch as movable and an annotated tag to its commit, immovable", async () => {
		const branch = git(remote, "branch", "--show-current");
		await expect(resolveRemoteRef(remoteUrl, branch)).resolves.toEqual({
			sha: headSha,
			movable: true,
		});
		await expect(resolveRemoteRef(remoteUrl, "v1")).resolves.toEqual({
			sha: headSha,
			movable: false,
		});
	});

	it("passes a full sha through without touching the network", async () => {
		await expect(resolveRemoteRef("https://invalid.invalid/none.git", headSha)).resolves.toEqual({
			sha: headSha,
			movable: false,
		});
	});

	it("says not-found and no-access are indistinguishable, and how to authenticate", async () => {
		const missing = pathToFileURL(join(workspace, "no-such-repo")).href;
		await expect(resolveRemoteRef(missing, undefined)).rejects.toThrow(/not found.*access/s);
		await expect(resolveRemoteRef(missing, undefined)).rejects.toThrow(/GH_TOKEN/);
	});

	it("reports a ref the remote does not have", async () => {
		await expect(resolveRemoteRef(remoteUrl, "no-such-ref")).rejects.toThrow(/no such ref/);
	});
});

describe("cloneAtSha", () => {
	it("materializes the tree with its git history intact", async () => {
		const dir = join(workspace, "clone");
		await cloneAtSha(remoteUrl, headSha, dir);

		expect(existsSync(join(dir, "docs", "README.md"))).toBe(true);
		// The blobless clone still answers `git log`, so `modified` dates survive
		// — the property that ruled out tarballs.
		const dates = await lastCommitDates(join(dir, "docs"));
		expect(Date.parse(dates.get("README.md") as string)).toBe(Date.parse(COMMIT_DATE));
	});

	it("reuses a completed clone without re-fetching", async () => {
		const dir = join(workspace, "clone");
		const sentinel = join(dir, "sentinel");
		writeFileSync(sentinel, "");
		await cloneAtSha("https://invalid.invalid/none.git", headSha, dir);
		expect(existsSync(sentinel)).toBe(true);
	});
});

describe("fetchRepo and resolveFetchedRepos", () => {
	it("fetches into the sha-keyed cache and remembers the resolution", async () => {
		const dir = await fetchRepo("acme/fetched", opts());
		expect(dir).toBe(repoCacheDir("acme/fetched", headSha, env));
		expect(existsSync(join(dir, "docs", "guide.md"))).toBe(true);

		// A second fetch resolves from the record and reuses the clone.
		await expect(
			fetchRepo("acme/fetched", { ...opts(), urlFor: () => "file:///nope" })
		).resolves.toBe(dir);
	});

	it("fills repos gaps by fetching, and indexes the fetched root with dates", async () => {
		const meta = join(workspace, "meta");
		mkdirSync(join(meta, "docs"), { recursive: true });
		writeFileSync(join(meta, "docs", "README.md"), "# Meta\n");

		const config: WeftConfig = {
			rootDir: meta,
			docsDir: "docs",
			entryPoint: "docs/README.md",
			ignore: [],
			projects: [
				{ name: "Meta", docsDir: "docs" },
				{ name: "Fetched", docsDir: "docs", repo: "acme/fetched" },
			],
		};

		const resolved = await resolveFetchedRepos(config, opts());
		expect(resolved.repos?.["acme/fetched"]).toBe(repoCacheDir("acme/fetched", headSha, env));

		const manifest = await buildManifest(resolved);
		const node = manifest.nodes.find((n) => n.id === "fetched/guide.md");
		expect(node).toBeDefined();
		expect(Date.parse(node?.modified as string)).toBe(Date.parse(COMMIT_DATE));
	});

	it("keeps a real local checkout over fetching", async () => {
		const local = join(workspace, "local-alpha");
		mkdirSync(join(local, "docs"), { recursive: true });
		const config: WeftConfig = {
			rootDir: workspace,
			docsDir: "docs",
			entryPoint: "docs/README.md",
			ignore: [],
			repos: { "acme/alpha": local },
			projects: [{ name: "Alpha", docsDir: "docs", repo: "acme/alpha" }],
		};

		// urlFor throws, proving no fetch is attempted for the mapped repo.
		const resolved = await resolveFetchedRepos(config, {
			...opts(),
			urlFor: () => {
				throw new Error("should not fetch");
			},
		});
		expect(resolved).toBe(config);
	});

	it("fetches a mapped repo whose local path does not exist", async () => {
		const config: WeftConfig = {
			rootDir: workspace,
			docsDir: "docs",
			entryPoint: "docs/README.md",
			ignore: [],
			repos: { "acme/fetched": join(workspace, "missing-checkout") },
		};

		const resolved = await resolveFetchedRepos(config, opts());
		expect(resolved.repos?.["acme/fetched"]).toBe(repoCacheDir("acme/fetched", headSha, env));
	});

	it("rejects a malformed identity", async () => {
		await expect(fetchRepo("not-an-identity", opts())).rejects.toThrow(/org\/repo/);
	});
});
