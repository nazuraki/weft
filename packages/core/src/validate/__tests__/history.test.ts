import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WeftConfig } from "../../types.js";
import { NO_HISTORY, graphHistory } from "../history.js";

describe("graphHistory", () => {
	let repo: string;

	function config(overrides: Partial<WeftConfig> = {}): WeftConfig {
		return {
			rootDir: repo,
			docsDir: "docs",
			entryPoint: "docs/README.md",
			ignore: [],
			...overrides,
		};
	}

	beforeAll(() => {
		repo = mkdtempSync(join(tmpdir(), "weft-history-"));
		const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });

		git("init", "-q");
		git("config", "user.email", "test@example.com");
		git("config", "user.name", "Test");
		git("config", "commit.gpgsign", "false");

		for (const dir of ["docs", "products/alpha/docs", "products/beta/docs"]) {
			mkdirSync(join(repo, dir), { recursive: true });
		}

		// The same content in both products, so a check comparing raw paths rather
		// than node ids would have something to conflate.
		writeFileSync(join(repo, "docs/guide.md"), "# Guide\n");
		writeFileSync(join(repo, "products/alpha/docs/shared.md"), "# Shared\n");
		writeFileSync(join(repo, "products/beta/docs/shared.md"), "# Shared\n");
		git("add", "-A");
		git("commit", "-q", "-m", "initial");

		git("mv", "docs/guide.md", "docs/handbook.md");
		git("commit", "-q", "-m", "rename guide");
	});

	afterAll(() => rmSync(repo, { recursive: true, force: true }));

	it("keys a single-project history by bare node id", async () => {
		const { blobs } = await graphHistory(config());

		expect(blobs.has("handbook.md")).toBe(true);
	});

	it("keys a multi-project history by namespaced node id", async () => {
		const { blobs } = await graphHistory(
			config({
				projects: [
					{ name: "Alpha", docsDir: "products/alpha/docs" },
					{ name: "Beta", docsDir: "products/beta/docs" },
				],
			})
		);

		// Namespacing happens once, in the runner, so no check has to redo it —
		// and two products' identically named documents stay distinct.
		expect(blobs.has("alpha/shared.md")).toBe(true);
		expect(blobs.has("beta/shared.md")).toBe(true);
		expect(blobs.has("shared.md")).toBe(false);
	});

	it("still records that the two products hold identical content", async () => {
		const { blobs } = await graphHistory(
			config({
				projects: [
					{ name: "Alpha", docsDir: "products/alpha/docs" },
					{ name: "Beta", docsDir: "products/beta/docs" },
				],
			})
		);

		const alpha = blobs.get("alpha/shared.md") ?? new Set();
		const beta = blobs.get("beta/shared.md") ?? new Set();

		expect([...alpha].some((blob) => beta.has(blob))).toBe(true);
	});

	it("namespaces both sides of a rename", async () => {
		const { renames } = await graphHistory(
			config({ projects: [{ name: "Docs", docsDir: "docs" }] })
		);

		expect(renames.get("docs/guide.md")).toBe("docs/handbook.md");
	});

	it("reports a rename by bare id in single-project mode", async () => {
		const { renames } = await graphHistory(config());

		expect(renames.get("guide.md")).toBe("handbook.md");
	});

	it("is empty outside a repository rather than throwing", async () => {
		const loose = mkdtempSync(join(tmpdir(), "weft-nogit-"));
		try {
			const history = await graphHistory({ ...config(), rootDir: loose });

			expect(history.blobs.size).toBe(0);
			expect(history.renames.size).toBe(0);
		} finally {
			rmSync(loose, { recursive: true, force: true });
		}
	});
});

describe("NO_HISTORY", () => {
	it("is readable without guarding, so a check needs no special case", () => {
		expect(NO_HISTORY.blobs.get("anything.md")).toBeUndefined();
		expect(NO_HISTORY.renames.size).toBe(0);
	});
});
