import { homedir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGitHubBlobUrl, resolveRepos } from "./repos.js";

const ROOT = resolve("/project");

describe("resolveRepos", () => {
	it("returns an empty map for an absent config", () => {
		expect(resolveRepos(undefined, ROOT).size).toBe(0);
	});

	it("resolves relative paths against the root dir", () => {
		const repos = resolveRepos({ "acme/alpha": "../alpha" }, ROOT);
		expect(repos.get("acme/alpha")).toBe(resolve(ROOT, "../alpha"));
	});

	it("keeps absolute paths as they are", () => {
		const abs = resolve("/checkouts/beta");
		const repos = resolveRepos({ "acme/beta": abs }, ROOT);
		expect(repos.get("acme/beta")).toBe(abs);
	});

	it("expands ~ to the home directory", () => {
		const repos = resolveRepos({ "acme/beta": "~/src/beta" }, ROOT);
		expect(repos.get("acme/beta")).toBe(resolve(homedir(), "src/beta"));
	});

	it("does not expand ~ in the middle of a path", () => {
		const repos = resolveRepos({ "acme/beta": "checkouts/~beta" }, ROOT);
		expect(repos.get("acme/beta")).toBe(resolve(ROOT, "checkouts/~beta"));
	});
});

describe("parseGitHubBlobUrl", () => {
	it("parses repo identity, path and anchor", () => {
		expect(
			parseGitHubBlobUrl("https://github.com/acme/alpha/blob/main/docs/api.md#endpoints")
		).toEqual({
			repo: "acme/alpha",
			path: "docs/api.md",
			anchor: "#endpoints",
		});
	});

	it("accepts any ref segment — weft serves the working tree", () => {
		expect(parseGitHubBlobUrl("https://github.com/acme/alpha/blob/v2.1/docs/api.md")).toEqual({
			repo: "acme/alpha",
			path: "docs/api.md",
		});
	});

	it("accepts http and a www prefix", () => {
		expect(parseGitHubBlobUrl("http://www.github.com/acme/alpha/blob/main/README.md")).toEqual({
			repo: "acme/alpha",
			path: "README.md",
		});
	});

	it("decodes percent-encoded paths", () => {
		expect(
			parseGitHubBlobUrl("https://github.com/acme/alpha/blob/main/docs/release%20notes.md")?.path
		).toBe("docs/release notes.md");
	});

	it("returns undefined for tree URLs, other hosts, and non-blob paths", () => {
		expect(parseGitHubBlobUrl("https://github.com/acme/alpha/tree/main/docs")).toBeUndefined();
		expect(parseGitHubBlobUrl("https://gitlab.com/acme/alpha/blob/main/a.md")).toBeUndefined();
		expect(parseGitHubBlobUrl("https://github.com/acme/alpha")).toBeUndefined();
		expect(parseGitHubBlobUrl("https://github.com/acme/alpha/issues/12")).toBeUndefined();
	});

	it("returns undefined for a malformed percent encoding", () => {
		expect(
			parseGitHubBlobUrl("https://github.com/acme/alpha/blob/main/%E0%A4%A.md")
		).toBeUndefined();
	});
});
