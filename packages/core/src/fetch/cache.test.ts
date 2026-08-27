import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gitAuthEnv, resolveToken } from "./auth.js";
import {
	REF_TTL_MS,
	cacheRoot,
	isCachePath,
	readCachedSha,
	repoCacheDir,
	writeCachedSha,
} from "./cache.js";

const SHA = "a".repeat(40);

let tmp: string;
let env: NodeJS.ProcessEnv;

beforeAll(() => {
	tmp = mkdtempSync(join(tmpdir(), "weft-fetch-cache-"));
	env = { WEFT_CACHE_DIR: tmp };
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("resolveToken", () => {
	it("prefers GH_TOKEN over GITHUB_TOKEN", async () => {
		await expect(resolveToken({ GH_TOKEN: "gh", GITHUB_TOKEN: "hub" })).resolves.toBe("gh");
		await expect(resolveToken({ GITHUB_TOKEN: "hub" })).resolves.toBe("hub");
	});

	it("ignores a blank variable", async () => {
		await expect(resolveToken({ GH_TOKEN: "  ", GITHUB_TOKEN: "hub" })).resolves.toBe("hub");
	});
});

describe("gitAuthEnv", () => {
	it("scopes a basic Authorization header to github.com via GIT_CONFIG variables", () => {
		const authEnv = gitAuthEnv("t0ken");
		expect(authEnv.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraheader");
		expect(authEnv.GIT_CONFIG_VALUE_0).toBe(
			`Authorization: Basic ${Buffer.from("x-access-token:t0ken").toString("base64")}`
		);
	});

	it("is empty without a token", () => {
		expect(gitAuthEnv(undefined)).toEqual({});
		expect(gitAuthEnv("")).toEqual({});
	});
});

describe("cache layout", () => {
	it("honors WEFT_CACHE_DIR, then XDG_CACHE_HOME", () => {
		expect(cacheRoot({ WEFT_CACHE_DIR: tmp })).toBe(resolve(tmp));
		expect(cacheRoot({ XDG_CACHE_HOME: tmp })).toBe(join(resolve(tmp), "weft"));
	});

	it("keys a checkout by host, identity and sha", () => {
		expect(repoCacheDir("acme/alpha", SHA, env)).toBe(join(tmp, "github.com", "acme/alpha", SHA));
	});

	it("recognizes paths inside the cache and only those", () => {
		expect(isCachePath(join(tmp, "github.com", "acme", "alpha", SHA), env)).toBe(true);
		expect(isCachePath(tmp, env)).toBe(false);
		expect(isCachePath(join(tmpdir(), "elsewhere"), env)).toBe(false);
	});
});

describe("ref records", () => {
	it("round-trips a resolution", () => {
		writeCachedSha("acme/alpha", "v1", SHA, false, env);
		expect(readCachedSha("acme/alpha", "v1", env)).toBe(SHA);
	});

	it("expires a branch resolution after the TTL, but never a tag's", () => {
		const stale = new Date(Date.now() - REF_TTL_MS - 1000).toISOString();
		const path = join(tmp, "github.com", "acme/beta", "refs.json");
		mkdirSync(join(tmp, "github.com", "acme/beta"), { recursive: true });
		writeFileSync(
			path,
			JSON.stringify({
				main: { sha: SHA, resolvedAt: stale, movable: true },
				v1: { sha: SHA, resolvedAt: stale, movable: false },
			})
		);

		expect(readCachedSha("acme/beta", "main", env)).toBeUndefined();
		expect(readCachedSha("acme/beta", "v1", env)).toBe(SHA);
	});

	it("returns undefined for an unknown ref or unreadable record", () => {
		expect(readCachedSha("acme/alpha", "nope", env)).toBeUndefined();
		const path = join(tmp, "github.com", "acme/gamma", "refs.json");
		mkdirSync(join(tmp, "github.com", "acme/gamma"), { recursive: true });
		writeFileSync(path, "not json");
		expect(readCachedSha("acme/gamma", "main", env)).toBeUndefined();
	});
});
