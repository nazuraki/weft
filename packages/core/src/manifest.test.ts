import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveDocsRoots } from "./config.js";
import { buildManifest, splitManifest } from "./manifest.js";
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

		expect(arch?.anchors).toContain("#overview");
		expect(arch?.anchors).toContain("#data-flow");
		expect(arch?.anchors).toContain("#database-schema");
	});

	it("extracts openapi anchors", async () => {
		const manifest = await buildManifest(fixtureConfig());
		const api = manifest.nodes.find((n) => n.id === "api.yaml");

		expect(api?.anchors).toContain("#listUsers");
		expect(api?.anchors).toContain("#/components/schemas/User");
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

	it("sets version to 1", async () => {
		const manifest = await buildManifest(fixtureConfig());
		expect(manifest.version).toBe(1);
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

		expect(manifest.nodes.map((n) => n.id)).toEqual(["beta/api.yaml", "alpha/features.md"]);
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
