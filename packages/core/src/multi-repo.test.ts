import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildManifest } from "./manifest.js";
import { WeftService } from "./service.js";
import type { ProjectsIndex, WeftConfig } from "./types.js";

/**
 * Out-of-tree docs roots end to end: a meta repo whose config maps a sibling
 * checkout through `repos`, exercising indexing, cross-repo edges, per-root
 * git history, manifest placement and watching — the behaviours that used to
 * work by accident and could regress silently.
 */

const META_DATE = "2026-01-02T00:00:00+00:00";
const ALPHA_DATE = "2026-07-30T00:00:00+00:00";

let workspace: string;
let meta: string;
let alpha: string;

function gitCommitAll(repo: string, date: string): void {
	const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
	git("init", "-q");
	git("config", "user.email", "test@example.com");
	git("config", "user.name", "Test");
	git("config", "commit.gpgsign", "false");
	git("add", "-A");
	git("commit", "-q", "-m", "init", "--date", date);
}

function multiRepoConfig(overrides: Partial<WeftConfig> = {}): WeftConfig {
	return {
		rootDir: meta,
		docsDir: "docs",
		entryPoint: "docs/README.md",
		ignore: [],
		repos: { "acme/alpha": "../alpha" },
		projects: [
			{ name: "Meta", docsDir: "docs" },
			{ name: "Alpha", docsDir: "docs", repo: "acme/alpha" },
		],
		...overrides,
	};
}

beforeAll(() => {
	workspace = mkdtempSync(join(tmpdir(), "weft-multi-repo-"));
	meta = join(workspace, "meta");
	alpha = join(workspace, "alpha");

	mkdirSync(join(meta, "docs"), { recursive: true });
	writeFileSync(
		join(meta, "docs", "README.md"),
		[
			"# Meta",
			"",
			"[Alpha guide](../../alpha/docs/guide.md)",
			"[Alpha API](https://github.com/acme/alpha/blob/main/docs/api.md#endpoints)",
			"[Unmapped](https://github.com/acme/other/blob/main/docs/api.md)",
			"",
		].join("\n")
	);

	mkdirSync(join(alpha, "docs"), { recursive: true });
	writeFileSync(join(alpha, "docs", "guide.md"), "# Guide\n\n[API](api.md)\n");
	writeFileSync(join(alpha, "docs", "api.md"), "# API\n\n## Endpoints\n");

	// Distinct commit dates, so a node dated from the wrong repo's history is
	// distinguishable from one dated from its own.
	gitCommitAll(meta, META_DATE);
	gitCommitAll(alpha, ALPHA_DATE);
});

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

describe("multi-repo indexing", () => {
	it("indexes nodes from both checkouts into one namespaced graph", async () => {
		const manifest = await buildManifest(multiRepoConfig());
		const ids = manifest.nodes.map((n) => n.id).sort();

		expect(ids).toEqual(["alpha/api.md", "alpha/guide.md", "meta/README.md"]);
		expect(manifest.projects).toEqual([
			{ name: "Meta", slug: "meta", docsDir: "docs" },
			{ name: "Alpha", slug: "alpha", docsDir: "docs", repo: "acme/alpha" },
		]);
	});

	it("resolves a relative link crossing into the sibling checkout", async () => {
		const manifest = await buildManifest(multiRepoConfig());

		expect(manifest.edges).toContainEqual({
			from: { node: "meta/README.md" },
			to: { node: "alpha/guide.md" },
			type: "references",
			label: "Alpha guide",
		});
	});

	it("resolves a GitHub blob URL into the mapped checkout, and only there", async () => {
		const manifest = await buildManifest(multiRepoConfig());

		expect(manifest.edges).toContainEqual({
			from: { node: "meta/README.md" },
			to: { node: "alpha/api.md", anchor: "#endpoints" },
			type: "references",
			label: "Alpha API",
			resolvedFrom: "https://github.com/acme/alpha/blob/main/docs/api.md#endpoints",
		});
		// The unmapped repo's URL stays an ordinary external link.
		expect(manifest.edges.some((e) => e.label === "Unmapped")).toBe(false);
	});

	it("dates each node from its own repo's history", async () => {
		const manifest = await buildManifest(multiRepoConfig());
		const modified = (id: string) => manifest.nodes.find((n) => n.id === id)?.modified;

		expect(Date.parse(modified("meta/README.md") as string)).toBe(Date.parse(META_DATE));
		expect(Date.parse(modified("alpha/guide.md") as string)).toBe(Date.parse(ALPHA_DATE));
	});
});

describe("multi-repo manifest placement", () => {
	afterEach(() => {
		for (const dir of [join(meta, ".weft"), join(meta, "docs", ".weft"), join(alpha, "docs", ".weft")]) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("writes the external root's manifest under the meta repo, leaving the checkout clean", async () => {
		const service = new WeftService(multiRepoConfig());
		const written = await service.writeManifest();

		const alphaManifest = resolve(meta, ".weft", "projects", "alpha", "manifest.json");
		expect(written).toContain(alphaManifest);
		expect(existsSync(alphaManifest)).toBe(true);
		expect(existsSync(join(alpha, "docs", ".weft"))).toBe(false);
		expect(written.every((path) => !path.startsWith(alpha))).toBe(true);

		const index = JSON.parse(
			readFileSync(resolve(meta, ".weft", "projects.json"), "utf-8")
		) as ProjectsIndex;
		expect(index.projects).toContainEqual({
			name: "Alpha",
			slug: "alpha",
			docsDir: "docs",
			repo: "acme/alpha",
			manifest: ".weft/projects/alpha/manifest.json",
		});
	});

	it("manifestInRepo opts an external root back into an in-checkout manifest", async () => {
		const service = new WeftService(
			multiRepoConfig({
				projects: [
					{ name: "Meta", docsDir: "docs" },
					{ name: "Alpha", docsDir: "docs", repo: "acme/alpha", manifestInRepo: true },
				],
			})
		);
		const written = await service.writeManifest();

		expect(written).toContain(resolve(alpha, "docs", ".weft", "manifest.json"));
		expect(existsSync(join(alpha, "docs", ".weft", "manifest.json"))).toBe(true);
	});

	it("keeps the merged manifest under rootDir for an external single implicit root", () => {
		const service = new WeftService({
			rootDir: meta,
			docsDir: "../alpha/docs",
			entryPoint: "../alpha/docs/guide.md",
			ignore: [],
		});
		expect(service.manifestPath).toBe(resolve(meta, ".weft", "manifest.json"));
	});
});

describe("multi-repo service", () => {
	it("reads a document living in the external checkout", async () => {
		const service = new WeftService(multiRepoConfig());
		await service.getManifest();

		expect(service.read("alpha/guide.md")).toContain("# Guide");
	});

	it("rebuilds when a document changes in the external checkout", async () => {
		const service = new WeftService(multiRepoConfig());
		await service.getManifest();

		const rebuilt = new Promise<string[]>((resolvePromise, reject) => {
			const timer = setTimeout(() => reject(new Error("watch never fired")), 8000);
			const stop = service.watch((manifest) => {
				clearTimeout(timer);
				stop();
				resolvePromise(manifest.nodes.map((n) => n.id));
			});

			// Give chokidar a moment to establish its watchers before mutating.
			setTimeout(() => {
				writeFileSync(join(alpha, "docs", "new-page.md"), "# New Page\n");
			}, 300);
		});

		try {
			await expect(rebuilt).resolves.toContain("alpha/new-page.md");
		} finally {
			rmSync(join(alpha, "docs", "new-page.md"), { force: true });
		}
	}, 10000);
});
