import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDocsRoots } from "./config.js";
import { countLines, hashContent } from "./content.js";
import { MANIFEST_VERSION, buildManifest, splitManifest } from "./manifest.js";
import type { WeftConfig } from "./types.js";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES_DIR = resolve(__dirname, "__fixtures__");
const MONOREPO_DIR = resolve(FIXTURES_DIR, "monorepo");

function fixtureConfig(overrides: Partial<WeftConfig> = {}): WeftConfig {
	return {
		rootDir: FIXTURES_DIR,
		docsDir: "docs",
		entryPoint: "docs/README.md",
		ignore: [],
		...overrides,
	};
}

function monorepoConfig(overrides: Partial<WeftConfig> = {}): WeftConfig {
	return {
		rootDir: MONOREPO_DIR,
		docsDir: "docs",
		entryPoint: "docs/README.md",
		ignore: [],
		projects: [
			{ name: "Alpha", docsDir: "products/alpha/docs" },
			{ name: "Beta", docsDir: "products/beta/docs" },
		],
		...overrides,
	};
}

describe("buildManifest", () => {
	it("discovers all doc nodes", async () => {
		const manifest = await buildManifest(fixtureConfig());

		const ids = manifest.nodes.map((n) => n.id).sort();
		expect(ids).toEqual(["README.md", "api.yaml", "architecture.md"]);
	});

	it("extracts markdown anchors", async () => {
		const manifest = await buildManifest(fixtureConfig());
		const arch = manifest.nodes.find((n) => n.id === "architecture.md");
		const slugs = arch?.anchors.map((a) => a.slug);

		expect(slugs).toContain("#overview");
		expect(slugs).toContain("#data-flow");
		expect(slugs).toContain("#database-schema");
	});

	it("carries line and level on markdown anchors", async () => {
		const manifest = await buildManifest(fixtureConfig());
		const overview = manifest.nodes
			.find((n) => n.id === "architecture.md")
			?.anchors.find((a) => a.slug === "#overview");

		expect(overview?.text).toBe("Overview");
		expect(overview?.level).toBe(2);
		expect(overview?.line).toBeGreaterThan(0);
	});

	it("extracts openapi anchors", async () => {
		const manifest = await buildManifest(fixtureConfig());
		const api = manifest.nodes.find((n) => n.id === "api.yaml");
		const slugs = api?.anchors.map((a) => a.slug);

		expect(slugs).toContain("#listUsers");
		expect(slugs).toContain("#/components/schemas/User");
	});

	it("extracts edges from markdown links", async () => {
		const manifest = await buildManifest(fixtureConfig());

		const readmeToArch = manifest.edges.filter(
			(e) => e.from.node === "README.md" && e.to.node === "architecture.md"
		);
		expect(readmeToArch.length).toBeGreaterThanOrEqual(1);

		const withAnchor = readmeToArch.find((e) => e.to.anchor === "#overview");
		expect(withAnchor).toBeDefined();
	});

	it("sets correct node types", async () => {
		const manifest = await buildManifest(fixtureConfig());

		expect(manifest.nodes.find((n) => n.id === "README.md")?.type).toBe("markdown");
		expect(manifest.nodes.find((n) => n.id === "api.yaml")?.type).toBe("openapi");
	});

	it("records a content hash and line count for every document", async () => {
		const manifest = await buildManifest(fixtureConfig());

		for (const node of manifest.nodes) {
			expect(node.contentHash).toMatch(/^[0-9a-f]{16}$/);
			expect(node.lineCount).toBeGreaterThan(0);
		}
	});

	it("hashes openapi documents as well as markdown ones", async () => {
		const manifest = await buildManifest(fixtureConfig());
		const api = manifest.nodes.find((n) => n.id === "api.yaml");

		expect(api?.contentHash).toMatch(/^[0-9a-f]{16}$/);
		expect(api?.lineCount).toBeGreaterThan(0);
	});

	it("gives different documents different hashes", async () => {
		const manifest = await buildManifest(fixtureConfig());
		const hashes = manifest.nodes.map((n) => n.contentHash);

		expect(new Set(hashes).size).toBe(hashes.length);
	});

	it("matches hashing the file's content directly", async () => {
		const manifest = await buildManifest(fixtureConfig());
		const arch = manifest.nodes.find((n) => n.id === "architecture.md");
		const raw = readFileSync(resolve(FIXTURES_DIR, "docs", "architecture.md"), "utf-8");

		expect(arch?.contentHash).toBe(hashContent(raw));
		expect(arch?.lineCount).toBe(countLines(raw));
	});

	it("stamps the current manifest schema version", async () => {
		const manifest = await buildManifest(fixtureConfig());
		expect(manifest.version).toBe(MANIFEST_VERSION);
		expect(MANIFEST_VERSION).toBe(2);
	});

	it("carries presentation config in the site block", async () => {
		const manifest = await buildManifest(
			fixtureConfig({
				defaultTheme: "dark",
				layout: "reader",
				siteTitle: "Weft Docs",
				siteUrl: "https://docs.example.com",
				ogImage: "og.png",
			})
		);

		expect(manifest.site).toEqual({
			defaultTheme: "dark",
			layout: "reader",
			siteTitle: "Weft Docs",
			siteUrl: "https://docs.example.com",
			ogImage: "og.png",
		});
	});

	it("omits the site block when nothing is configured", async () => {
		const manifest = await buildManifest(fixtureConfig());
		expect(manifest.site).toBeUndefined();
	});

	it("omits projects in single-project mode", async () => {
		const manifest = await buildManifest(fixtureConfig());

		expect(manifest.projects).toBeUndefined();
		expect(manifest.nodes.every((n) => n.project === undefined)).toBe(true);
	});

	it("strips a docsDir prefix from docOrder entries", async () => {
		const manifest = await buildManifest(
			fixtureConfig({ docOrder: ["docs/architecture.md", "README.md"] })
		);

		expect(manifest.nodes.slice(0, 2).map((n) => n.id)).toEqual(["architecture.md", "README.md"]);
	});
});

describe("buildManifest (published-form links)", () => {
	const publishedConfig = (): WeftConfig => ({
		rootDir: resolve(FIXTURES_DIR, "published"),
		docsDir: "docs",
		entryPoint: "docs/index.md",
		ignore: [],
	});

	const edgesFrom = async () =>
		(await buildManifest(publishedConfig())).edges.filter((e) => e.from.node === "index.md");

	it("resolves a link to a rendered sibling back to its source", async () => {
		const edges = await edgesFrom();
		const resolved = edges.filter((e) => e.resolvedFrom === "guide.html");

		expect(resolved.map((e) => e.to.node)).toEqual(["guide.md", "guide.md"]);
	});

	it("keeps the anchor when rewriting a published link", async () => {
		const edges = await edgesFrom();
		const withAnchor = edges.find((e) => e.resolvedFrom === "guide.html" && e.to.anchor);

		expect(withAnchor?.to).toEqual({ node: "guide.md", anchor: "#setup" });
	});

	it("resolves a rendered sibling of an openapi document", async () => {
		const edges = await edgesFrom();

		expect(edges.find((e) => e.resolvedFrom === "api.html")?.to.node).toBe("api.yaml");
	});

	it("leaves a published link with no source sibling unresolved", async () => {
		const edges = await edgesFrom();
		const orphan = edges.find((e) => e.to.node === "reports/q4.html");

		expect(orphan).toBeDefined();
		expect(orphan?.resolvedFrom).toBeUndefined();
	});

	it("does not mark a link that already named a node", async () => {
		const edges = await edgesFrom();
		const direct = edges.filter((e) => e.to.node === "guide.md" && !e.resolvedFrom);

		expect(direct).toHaveLength(1);
	});

	it("makes those edges resolve, where before they pointed at nothing", async () => {
		const manifest = await buildManifest(publishedConfig());
		const ids = new Set(manifest.nodes.map((n) => n.id));
		const dead = manifest.edges.filter((e) => !ids.has(e.to.node));

		// Only the genuinely orphaned one is left.
		expect(dead.map((e) => e.to.node)).toEqual(["reports/q4.html"]);
	});
});

describe("buildManifest (contributions)", () => {
	const dirs: string[] = [];

	/** A copy of the docs fixture plus a contribution file, somewhere writable. */
	function projectWith(contribution: object): string {
		const dir = mkdtempSync(resolve(tmpdir(), "weft-contrib-build-"));
		dirs.push(dir);
		cpSync(resolve(FIXTURES_DIR, "docs"), resolve(dir, "docs"), { recursive: true });
		writeFileSync(resolve(dir, "build.json"), JSON.stringify({ version: 1, ...contribution }));
		return dir;
	}

	function contributedConfig(dir: string, overrides: Partial<WeftConfig> = {}): WeftConfig {
		return {
			rootDir: dir,
			docsDir: "docs",
			entryPoint: "docs/README.md",
			ignore: [],
			contributions: ["build.json"],
			...overrides,
		};
	}

	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it("merges a contributed node into the indexed graph", async () => {
		const dir = projectWith({ nodes: [{ id: "generated.md", type: "markdown", title: "Gen" }] });
		const manifest = await buildManifest(contributedConfig(dir));

		expect(manifest.nodes.map((n) => n.id)).toContain("generated.md");
		expect(manifest.nodes.map((n) => n.id)).toContain("architecture.md");
	});

	it("sorts a contributed node with the indexed ones rather than appending it", async () => {
		const dir = projectWith({ nodes: [{ id: "AAA.md", type: "markdown" }] });
		const manifest = await buildManifest(contributedConfig(dir));

		expect(manifest.nodes[0].id).toBe("AAA.md");
	});

	it("honours docOrder for a contributed node", async () => {
		const dir = projectWith({ nodes: [{ id: "generated.md", type: "markdown" }] });
		const manifest = await buildManifest(
			contributedConfig(dir, { docOrder: ["generated.md", "README.md"] })
		);

		expect(manifest.nodes.slice(0, 2).map((n) => n.id)).toEqual(["generated.md", "README.md"]);
	});

	it("applies a metadata patch to a document that was indexed", async () => {
		const dir = projectWith({ metadata: { "architecture.md": { title: "Architecture v2.41" } } });
		const manifest = await buildManifest(contributedConfig(dir));

		expect(manifest.nodes.find((n) => n.id === "architecture.md")?.title).toBe(
			"Architecture v2.41"
		);
	});

	it("keeps the indexed hash and anchors a patch did not touch", async () => {
		const dir = projectWith({ metadata: { "architecture.md": { title: "Renamed" } } });
		const arch = (await buildManifest(contributedConfig(dir))).nodes.find(
			(n) => n.id === "architecture.md"
		);

		expect(arch?.contentHash).toMatch(/^[0-9a-f]{16}$/);
		expect(arch?.anchors.length).toBeGreaterThan(0);
	});

	it("adds contributed edges to the graph", async () => {
		const dir = projectWith({
			edges: [
				{ from: { node: "README.md" }, to: { node: "architecture.md" }, type: "derives-from" },
			],
		});
		const manifest = await buildManifest(contributedConfig(dir));

		expect(manifest.edges.some((e) => e.type === "derives-from")).toBe(true);
	});

	it("indexes source unchanged when no contributions are configured", async () => {
		const dir = projectWith({ nodes: [{ id: "generated.md", type: "markdown" }] });
		const manifest = await buildManifest(contributedConfig(dir, { contributions: undefined }));

		expect(manifest.nodes.map((n) => n.id)).not.toContain("generated.md");
	});
});

describe("buildManifest (docOrderStrict)", () => {
	const strict = () =>
		buildManifest(fixtureConfig({ docOrder: ["architecture.md"], docOrderStrict: true }));

	it("keeps every document in the graph", async () => {
		const manifest = await strict();

		expect(manifest.nodes.map((n) => n.id).sort()).toEqual([
			"README.md",
			"api.yaml",
			"architecture.md",
		]);
	});

	it("marks the unlisted documents as hidden from the nav", async () => {
		const manifest = await strict();
		const hidden = manifest.nodes.filter((n) => n.hiddenFromNav).map((n) => n.id);

		expect(hidden.sort()).toEqual(["README.md", "api.yaml"]);
		expect(manifest.nodes.find((n) => n.id === "architecture.md")?.hiddenFromNav).toBeUndefined();
	});

	it("still orders the listed documents first", async () => {
		const manifest = await strict();
		expect(manifest.nodes[0].id).toBe("architecture.md");
	});

	it("leaves no edge pointing at a document outside the graph", async () => {
		const manifest = await strict();
		const ids = new Set(manifest.nodes.map((n) => n.id));

		// The invariant strict mode used to break: an edge whose source or target
		// was filtered out survived in the manifest with nothing to resolve to.
		for (const edge of manifest.edges) {
			expect(ids.has(edge.from.node)).toBe(true);
			expect(ids.has(edge.to.node)).toBe(true);
		}
		expect(manifest.edges.length).toBeGreaterThan(0);
	});

	it("marks nothing when docOrderStrict is off", async () => {
		const manifest = await buildManifest(fixtureConfig({ docOrder: ["architecture.md"] }));

		expect(manifest.nodes.every((n) => n.hiddenFromNav === undefined)).toBe(true);
	});
});

describe("buildManifest (multi-project)", () => {
	it("namespaces node ids by project slug", async () => {
		const manifest = await buildManifest(monorepoConfig());

		expect(manifest.nodes.map((n) => n.id).sort()).toEqual([
			"alpha/README.md",
			"alpha/features.md",
			"beta/README.md",
			"beta/api.yaml",
		]);
	});

	it("tags each node with its owning project", async () => {
		const manifest = await buildManifest(monorepoConfig());

		expect(manifest.nodes.find((n) => n.id === "alpha/features.md")?.project).toBe("alpha");
		expect(manifest.nodes.find((n) => n.id === "beta/api.yaml")?.project).toBe("beta");
	});

	it("records the configured projects", async () => {
		const manifest = await buildManifest(monorepoConfig());

		expect(manifest.projects).toEqual([
			{ name: "Alpha", slug: "alpha", docsDir: "products/alpha/docs" },
			{ name: "Beta", slug: "beta", docsDir: "products/beta/docs" },
		]);
	});

	it("resolves a markdown link that crosses products", async () => {
		const manifest = await buildManifest(monorepoConfig());

		const crossing = manifest.edges.find(
			(e) => e.from.node === "alpha/features.md" && e.to.node === "beta/api.yaml"
		);
		expect(crossing).toBeDefined();
		expect(crossing?.to.anchor).toBe("#listUsers");
	});

	it("resolves bare and slug-qualified sidecar targets", async () => {
		const manifest = await buildManifest(monorepoConfig());
		const fromFeatures = manifest.edges.filter((e) => e.from.node === "alpha/features.md");

		const crossProduct = fromFeatures.find((e) => e.type === "implements");
		expect(crossProduct?.to).toEqual({
			node: "beta/api.yaml",
			anchor: "#/components/schemas/User",
		});
		expect(crossProduct?.from.anchor).toBe("#sync");

		const ownProject = fromFeatures.find((e) => e.type === "see-also");
		expect(ownProject?.to.node).toBe("alpha/README.md");
	});

	it("keeps intra-project links inside their own project", async () => {
		const manifest = await buildManifest(monorepoConfig());

		const edge = manifest.edges.find(
			(e) => e.from.node === "alpha/README.md" && e.type === "references"
		);
		expect(edge?.to.node).toBe("alpha/features.md");
	});

	it("accepts docOrder as a repo-relative path or a qualified id", async () => {
		const manifest = await buildManifest(
			monorepoConfig({
				docOrder: ["products/beta/docs/api.yaml", "alpha/features.md"],
				docOrderStrict: true,
			})
		);

		expect(manifest.nodes.slice(0, 2).map((n) => n.id)).toEqual([
			"beta/api.yaml",
			"alpha/features.md",
		]);
	});
});

describe("splitManifest", () => {
	it("returns nothing in single-project mode", async () => {
		const config = fixtureConfig();
		const manifest = await buildManifest(config);

		expect(splitManifest(manifest, resolveDocsRoots(config))).toEqual([]);
	});

	it("partitions nodes and edges by project, losing nothing", async () => {
		const config = monorepoConfig();
		const roots = resolveDocsRoots(config);
		const manifest = await buildManifest(config);
		const split = splitManifest(manifest, roots);

		expect(split.map((p) => p.project.slug)).toEqual(["alpha", "beta"]);

		const ids = (list: { id: string }[]) => list.map((n) => n.id).sort();
		expect(ids(split.flatMap((p) => p.nodes))).toEqual(ids(manifest.nodes));

		const edgeKey = (e: { from: { node: string }; to: { node: string }; type: string }) =>
			`${e.from.node}->${e.to.node}:${e.type}`;
		expect(split.flatMap((p) => p.edges.map(edgeKey)).sort()).toEqual(
			manifest.edges.map(edgeKey).sort()
		);
	});

	it("assigns every edge to the project of its source node", async () => {
		const config = monorepoConfig();
		const split = splitManifest(await buildManifest(config), resolveDocsRoots(config));

		for (const project of split) {
			expect(project.edges.every((e) => e.from.node.startsWith(`${project.project.slug}/`))).toBe(
				true
			);
			expect(project.nodes.every((n) => n.project === project.project.slug)).toBe(true);
		}

		// The cross-product edge lives with its source, not its target.
		const alpha = split.find((p) => p.project.slug === "alpha");
		expect(alpha?.edges.some((e) => e.to.node.startsWith("beta/"))).toBe(true);
	});
});
