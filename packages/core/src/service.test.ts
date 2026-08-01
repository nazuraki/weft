import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MANIFEST_VERSION } from "./manifest.js";
import { WeftService } from "./service.js";
import type { ProjectManifest, ProjectsIndex, WeftConfig } from "./types.js";
import { ValidatorRegistry } from "./validate/index.js";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES_DIR = resolve(__dirname, "__fixtures__");
const MONOREPO_DIR = resolve(FIXTURES_DIR, "monorepo");

const PROJECTS: WeftConfig["projects"] = [
	{ name: "Alpha", docsDir: "products/alpha/docs" },
	{ name: "Beta", docsDir: "products/beta/docs" },
];

function createService(): WeftService {
	const config: WeftConfig = {
		rootDir: FIXTURES_DIR,
		docsDir: "docs",
		entryPoint: "docs/README.md",
		ignore: [],
	};
	return new WeftService(config);
}

function createMonorepoService(rootDir = MONOREPO_DIR): WeftService {
	const config: WeftConfig = {
		rootDir,
		docsDir: "docs",
		entryPoint: "docs/README.md",
		ignore: [],
		projects: PROJECTS,
	};
	return new WeftService(config);
}

const tempDirs: string[] = [];

/** Copy the monorepo fixture somewhere writable so tests can mutate it. */
function copyMonorepo(): string {
	const dir = mkdtempSync(resolve(tmpdir(), "weft-monorepo-"));
	cpSync(MONOREPO_DIR, dir, { recursive: true });
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	while (tempDirs.length) {
		rmSync(tempDirs.pop() as string, { recursive: true, force: true });
	}
});

describe("WeftService", () => {
	it("builds and returns manifest", async () => {
		const service = createService();
		const manifest = await service.getManifest();

		expect(manifest.version).toBe(MANIFEST_VERSION);
		expect(manifest.nodes.length).toBeGreaterThan(0);
	});

	it("reads document content", async () => {
		const service = createService();
		const content = service.read("README.md");

		expect(content).toContain("Project Documentation");
	});

	it("searches documents", async () => {
		const service = createService();
		const results = await service.search("architecture");

		expect(results.length).toBeGreaterThan(0);
		expect(results[0].id).toBeDefined();
	});

	it("traverses outgoing edges", async () => {
		const service = createService();
		const edges = await service.traverse("README.md", "outgoing");

		expect(edges.length).toBeGreaterThan(0);
		expect(edges.every((e) => e.from.node === "README.md")).toBe(true);
	});

	it("traverses incoming edges", async () => {
		const service = createService();
		const edges = await service.traverse("architecture.md", "incoming");

		expect(edges.length).toBeGreaterThan(0);
		expect(edges.every((e) => e.to.node === "architecture.md")).toBe(true);
	});

	it("validates the manifest, building it on demand", async () => {
		const service = createService();
		const rule = {
			id: "node-count",
			description: "Counts nodes",
			defaultSeverity: "info",
		} as const;
		const registry = new ValidatorRegistry().register({
			rules: [rule],
			run: (context) => [
				{
					rule: rule.id,
					message: `${context.nodes.size} nodes`,
					target: { kind: "graph" },
				},
			],
		});

		const result = await service.validate(registry);

		expect(result.diagnostics).toEqual([
			{ rule: "node-count", severity: "info", message: "3 nodes", target: { kind: "graph" } },
		]);
	});

	it("validates against the built-in checks by default", async () => {
		const result = await createService().validate();

		expect(result.diagnostics).toEqual([]);
		expect(result.counts).toEqual({ error: 0, warn: 0, info: 0 });
	});

	it("writes a single manifest under docsDir", async () => {
		const dir = mkdtempSync(resolve(tmpdir(), "weft-single-"));
		tempDirs.push(dir);
		cpSync(resolve(FIXTURES_DIR, "docs"), resolve(dir, "docs"), { recursive: true });

		const service = new WeftService({
			rootDir: dir,
			docsDir: "docs",
			entryPoint: "docs/README.md",
			ignore: [],
		});

		const written = await service.writeManifest();
		expect(written).toEqual([resolve(dir, "docs", ".weft", "manifest.json")]);
	});
});

describe("WeftService (artifacts)", () => {
	const ARTIFACTS_DIR = resolve(FIXTURES_DIR, "artifacts");

	function createArtifactService(): WeftService {
		return new WeftService({
			rootDir: ARTIFACTS_DIR,
			docsDir: "docs",
			entryPoint: "docs/README.md",
			ignore: [],
			artifacts: ["**/*.pdf"],
		});
	}

	it("refuses to read an artifact rather than returning a lossy decode", async () => {
		const service = createArtifactService();
		await service.getManifest();

		// Reading a PDF as UTF-8 does not throw — it succeeds and returns
		// nonsense, so the caller would get a 200 and a body full of mojibake.
		expect(() => service.read("handbook.pdf")).toThrow(/Not a readable document/);
	});

	it("still reads the document beside it", async () => {
		const service = createArtifactService();
		await service.getManifest();

		expect(service.read("handbook.md")).toContain("Integration Handbook");
	});

	it("refuses a path that was never a document, manifest or not", () => {
		expect(() => createArtifactService().read("notes.txt")).toThrow(/Not a readable document/);
	});

	it("keeps artifacts out of the search index", async () => {
		const service = createArtifactService();
		// "PDF" appears in the artifact's bytes; a binary-decoded index would
		// match it, and selecting the result would navigate nowhere.
		const results = await service.search("PDF");

		expect(results.every((r) => !r.id.endsWith(".pdf"))).toBe(true);
	});

	it("still finds the documents", async () => {
		const results = await createArtifactService().search("onboarding");

		expect(results.map((r) => r.id)).toContain("handbook.md");
	});

	it("traverses to an artifact, which is a real node", async () => {
		const service = createArtifactService();
		const edges = await service.traverse("handbook.pdf");

		expect(edges.map((e) => e.to.node)).toContain("handbook.md");
	});
});

describe("WeftService (multi-project)", () => {
	it("exposes a root per project", () => {
		const service = createMonorepoService();

		expect(service.namespaced).toBe(true);
		expect(service.docsRoots.map((r) => r.slug)).toEqual(["alpha", "beta"]);
		expect(service.docsRoots.map((r) => r.absDir)).toEqual([
			resolve(MONOREPO_DIR, "products/alpha/docs"),
			resolve(MONOREPO_DIR, "products/beta/docs"),
		]);
	});

	it("reads documents from every project", () => {
		const service = createMonorepoService();

		expect(service.read("alpha/features.md")).toContain("Alpha Features");
		expect(service.read("beta/api.yaml")).toContain("Beta API");
	});

	it("rejects a node id that escapes its project", () => {
		const service = createMonorepoService();

		expect(() => service.read("alpha/../../../secrets.md")).toThrow(/not found/);
		expect(service.resolveNodePath("alpha/../../../secrets.md")).toBeUndefined();
	});

	it("rejects a node id with an unknown project", () => {
		const service = createMonorepoService();
		expect(() => service.read("gamma/api.yaml")).toThrow(/not found/);
	});

	it("searches across every project", async () => {
		const service = createMonorepoService();

		expect((await service.search("reporting")).map((r) => r.id)).toContain("alpha/features.md");
		expect((await service.search("listUsers")).map((r) => r.id)).toContain("beta/api.yaml");
	});

	it("traverses an edge that crosses products", async () => {
		const service = createMonorepoService();
		const edges = await service.traverse("beta/api.yaml", "incoming");

		expect(edges.some((e) => e.from.node === "alpha/features.md")).toBe(true);
	});

	it("rebuilds a single project without dropping the others", async () => {
		const dir = copyMonorepo();
		const service = createMonorepoService(dir);
		await service.getManifest();

		writeFileSync(resolve(dir, "products/alpha/docs/extra.md"), "# Extra\n");
		writeFileSync(resolve(dir, "products/beta/docs/ignored.md"), "# Ignored\n");

		const manifest = await service.rebuild("alpha");
		const ids = manifest.nodes.map((n) => n.id);

		expect(ids).toContain("alpha/extra.md");
		// Beta was not rescanned, so its new file is absent but its existing nodes remain.
		expect(ids).not.toContain("beta/ignored.md");
		expect(ids).toContain("beta/api.yaml");

		expect((await service.rebuild()).nodes.map((n) => n.id)).toContain("beta/ignored.md");
	});

	it("writes a manifest per project, an index, and the merged manifest", async () => {
		const dir = copyMonorepo();
		const service = createMonorepoService(dir);

		const written = await service.writeManifest();

		expect(written).toEqual([
			resolve(dir, "products/alpha/docs", ".weft", "manifest.json"),
			resolve(dir, "products/beta/docs", ".weft", "manifest.json"),
			resolve(dir, ".weft", "projects.json"),
			resolve(dir, ".weft", "manifest.json"),
		]);

		const alpha = JSON.parse(
			readFileSync(resolve(dir, "products/alpha/docs/.weft/manifest.json"), "utf-8")
		) as ProjectManifest;
		expect(alpha.project).toEqual({
			name: "Alpha",
			slug: "alpha",
			docsDir: "products/alpha/docs",
		});
		expect(alpha.nodes.every((n) => n.project === "alpha")).toBe(true);

		const index = JSON.parse(
			readFileSync(resolve(dir, ".weft/projects.json"), "utf-8")
		) as ProjectsIndex;
		expect(index.manifest).toBe(".weft/manifest.json");
		expect(index.projects.map((p) => p.manifest)).toEqual([
			"products/alpha/docs/.weft/manifest.json",
			"products/beta/docs/.weft/manifest.json",
		]);

		// Every path in the index resolves to a file that was actually written.
		for (const path of [index.manifest, ...index.projects.map((p) => p.manifest)]) {
			expect(() => readFileSync(resolve(dir, path), "utf-8")).not.toThrow();
		}
	});
});
