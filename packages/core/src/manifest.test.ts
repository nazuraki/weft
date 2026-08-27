import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDocsRoots } from "./config.js";
import { countLines, hashBytes, hashContent } from "./content.js";
import {
	MANIFEST_VERSION,
	buildManifest,
	buildRootGraph,
	mergeGraphs,
	splitManifest,
} from "./manifest.js";
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

describe("buildRootGraph (shared history)", () => {
	it("stamps modified dates from a caller-provided walk instead of its own", async () => {
		const config = fixtureConfig();
		const roots = resolveDocsRoots(config);
		const date = "2026-02-03T04:05:06+00:00";

		const graph = await buildRootGraph(config, roots[0], roots, new Map([["README.md", date]]));

		const readme = graph.nodes.find((node) => node.id === "README.md");
		expect(readme?.modified).toBe(date);
		// A path the provided walk did not date stays undated — the scan must not
		// fall back to a walk of its own once one has been handed in.
		const arch = graph.nodes.find((node) => node.id === "architecture.md");
		expect(arch?.modified).toBeUndefined();
	});
});

describe("buildManifest", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

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

	it("records the version a document declares in its frontmatter", async () => {
		const manifest = await buildManifest(
			fixtureConfig({ rootDir: resolve(FIXTURES_DIR, "assertions") })
		);

		expect(manifest.nodes.find((n) => n.id === "spec.md")?.version).toBe("2.42");
	});

	it("leaves a document that declares no version without one", async () => {
		const manifest = await buildManifest(
			fixtureConfig({ rootDir: resolve(FIXTURES_DIR, "assertions") })
		);

		// Absence is normal — an append-only registry has no version to give —
		// so nothing downstream may treat it as an error.
		expect(manifest.nodes.find((n) => n.id === "registry.md")?.version).toBeUndefined();
	});

	it("dates every document from git history", async () => {
		const manifest = await buildManifest(fixtureConfig());

		for (const node of manifest.nodes) {
			// The fixtures are committed, so every one of them has a date. It comes
			// from the last commit touching the file, never from the filesystem: a
			// clone would give every document the checkout's mtime.
			expect(node.modified).toBeDefined();
			expect(Number.isNaN(Date.parse(node.modified as string))).toBe(false);
		}
	});

	it("indexes a docs tree outside a repository, just without dates", async () => {
		const loose = mkdtempSync(resolve(tmpdir(), "weft-loose-"));
		tempDirs.push(loose);
		cpSync(resolve(FIXTURES_DIR, "docs"), resolve(loose, "docs"), { recursive: true });

		const manifest = await buildManifest(fixtureConfig({ rootDir: loose }));

		expect(manifest.nodes.length).toBeGreaterThan(0);
		expect(manifest.nodes.every((n) => n.modified === undefined)).toBe(true);
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
				style: { dark: "luminous-precision", light: "summer-cloud" },
				styleUrl: "https://cdn.example.com/styles",
				layout: "reader",
				siteTitle: "Weft Docs",
				siteUrl: "https://docs.example.com",
				ogImage: "og.png",
			})
		);

		expect(manifest.site).toEqual({
			defaultTheme: "dark",
			style: { dark: "luminous-precision", light: "summer-cloud" },
			styleUrl: "https://cdn.example.com/styles",
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

describe("buildManifest (freshness)", () => {
	it("stamps a build block with an ISO 8601 builtAt and a hex inputsHash", async () => {
		const manifest = await buildManifest(fixtureConfig());

		expect(manifest.build?.builtAt).toBeDefined();
		expect(Number.isNaN(Date.parse(manifest.build?.builtAt as string))).toBe(false);
		expect(manifest.build?.inputsHash).toMatch(/^[0-9a-f]{16}$/);
	});

	it("round-trips through JSON with the build block intact", async () => {
		const manifest = await buildManifest(fixtureConfig());
		const roundTripped = JSON.parse(JSON.stringify(manifest));

		expect(roundTripped.build).toEqual(manifest.build);
	});
});

describe("mergeGraphs (freshness)", () => {
	it("stamps the build block it is passed", () => {
		const roots = resolveDocsRoots(fixtureConfig());
		const build = { builtAt: "2026-08-01T00:00:00.000Z", inputsHash: "abc123" };

		const manifest = mergeGraphs(fixtureConfig(), roots, new Map(), [], build);

		expect(manifest.build).toEqual(build);
	});

	it("omits the build block when none is passed", () => {
		const roots = resolveDocsRoots(fixtureConfig());

		const manifest = mergeGraphs(fixtureConfig(), roots, new Map());

		expect(manifest.build).toBeUndefined();
	});
});

describe("buildManifest (includes)", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	function includeFixture(): string {
		const dir = mkdtempSync(resolve(tmpdir(), "weft-includes-"));
		tempDirs.push(dir);
		cpSync(resolve(FIXTURES_DIR, "docs"), resolve(dir, "docs"), { recursive: true });
		writeFileSync(
			resolve(dir, "docs/README.md.weft"),
			["links:", "  - target: architecture.md#overview", "    type: includes"].join("\n")
		);
		return dir;
	}

	it("stamps resolved defaults onto an includes edge", async () => {
		const manifest = await buildManifest(fixtureConfig({ rootDir: includeFixture() }));
		const edge = manifest.edges.find((e) => e.type === "includes");

		expect(edge?.headingShift).toBe("auto");
		expect(edge?.contributes).toBe("source");
	});

	it("stamps configured defaults over built-in ones", async () => {
		const manifest = await buildManifest(
			fixtureConfig({ rootDir: includeFixture(), includes: { headingShift: "none" } })
		);
		const edge = manifest.edges.find((e) => e.type === "includes");

		expect(edge?.headingShift).toBe("none");
		expect(edge?.contributes).toBe("source");
	});

	it("leaves other edge types unstamped", async () => {
		const manifest = await buildManifest(fixtureConfig({ rootDir: includeFixture() }));

		for (const edge of manifest.edges.filter((e) => e.type !== "includes")) {
			expect("headingShift" in edge).toBe(false);
		}
	});
});

describe("buildManifest (artifacts)", () => {
	const ARTIFACTS_DIR = resolve(FIXTURES_DIR, "artifacts");

	function artifactConfig(overrides: Partial<WeftConfig> = {}): WeftConfig {
		return {
			rootDir: ARTIFACTS_DIR,
			docsDir: "docs",
			entryPoint: "docs/README.md",
			ignore: [],
			artifacts: ["**/*.pdf"],
			...overrides,
		};
	}

	it("registers a configured output as a node", async () => {
		const manifest = await buildManifest(artifactConfig());

		expect(manifest.nodes.map((n) => n.id).sort()).toContain("handbook.pdf");
	});

	it("indexes nothing extra when no artifacts are configured", async () => {
		const manifest = await buildManifest(artifactConfig({ artifacts: undefined }));

		// A PDF is not an indexable extension, so without the config key it was
		// never going to become a node.
		expect(manifest.nodes.every((n) => !n.id.endsWith(".pdf"))).toBe(true);
	});

	it("marks an artifact so it never reaches the nav", async () => {
		const manifest = await buildManifest(artifactConfig());
		const pdf = manifest.nodes.find((n) => n.id === "handbook.pdf");

		expect(pdf?.type).toBe("artifact");
		expect(pdf?.hiddenFromNav).toBe(true);
	});

	it("gives an artifact a hash but no anchors and no line count", async () => {
		const manifest = await buildManifest(artifactConfig());
		const pdf = manifest.nodes.find((n) => n.id === "handbook.pdf");

		expect(pdf?.contentHash).toMatch(/^[0-9a-f]{16}$/);
		expect(pdf?.anchors).toEqual([]);
		expect(pdf?.lineCount).toBeUndefined();
	});

	it("hashes the artifact's bytes rather than a text reading of them", async () => {
		const manifest = await buildManifest(artifactConfig());
		const pdf = manifest.nodes.find((n) => n.id === "handbook.pdf");
		const raw = readFileSync(resolve(ARTIFACTS_DIR, "docs", "handbook.pdf"));

		expect(pdf?.contentHash).toBe(hashBytes(raw));
		// Reading a PDF as UTF-8 does not throw, it silently mangles — so the two
		// recipes genuinely disagree here rather than coinciding.
		expect(pdf?.contentHash).not.toBe(hashContent(raw.toString("utf-8")));
	});

	it("titles an artifact with its file name", async () => {
		const manifest = await buildManifest(artifactConfig());

		expect(manifest.nodes.find((n) => n.id === "handbook.pdf")?.title).toBe("handbook.pdf");
	});

	it("respects ignore globs", async () => {
		const manifest = await buildManifest(artifactConfig({ ignore: ["**/appendix.pdf"] }));
		const ids = manifest.nodes.map((n) => n.id);

		expect(ids).toContain("handbook.pdf");
		expect(ids).not.toContain("appendix.pdf");
	});

	it("does not let a wide artifact glob replace an indexed document", async () => {
		const manifest = await buildManifest(artifactConfig({ artifacts: ["**/*"] }));
		const handbook = manifest.nodes.find((n) => n.id === "handbook.md");

		// The document has anchors and content; replacing it with a hash and a
		// file name would be a downgrade.
		expect(handbook?.type).toBe("markdown");
		expect(manifest.nodes.filter((n) => n.id === "handbook.md")).toHaveLength(1);
	});

	it("leaves a link to a registered artifact pointing at the artifact", async () => {
		const manifest = await buildManifest(artifactConfig());
		const link = manifest.edges.find(
			(e) => e.from.node === "README.md" && e.to.node === "handbook.pdf"
		);

		// Published-form resolution rewrites `handbook.pdf` to `handbook.md` when
		// the PDF is not a node. Registering it means the real target exists, so
		// the link must be left alone.
		expect(link).toBeDefined();
		expect(link?.resolvedFrom).toBeUndefined();
	});

	it("namespaces an artifact id by project", async () => {
		const manifest = await buildManifest({
			rootDir: ARTIFACTS_DIR,
			docsDir: "docs",
			entryPoint: "docs/README.md",
			ignore: [],
			artifacts: ["**/*.pdf"],
			projects: [{ name: "Guides", docsDir: "docs" }],
		});
		const pdf = manifest.nodes.find((n) => n.id === "guides/handbook.pdf");

		expect(pdf).toBeDefined();
		expect(pdf?.project).toBe("guides");
	});

	it("reads derives-from edges from a sidecar beside the artifact", async () => {
		const manifest = await buildManifest(artifactConfig());
		const derived = manifest.edges.filter((e) => e.type === "derives-from");

		expect(derived.map((e) => `${e.from.node} -> ${e.to.node}`).sort()).toEqual([
			"appendix.pdf -> appendix.md",
			"appendix.pdf -> handbook.md",
			"handbook.pdf -> handbook.md",
		]);
	});

	it("carries the recorded source hash onto the edge", async () => {
		const manifest = await buildManifest(artifactConfig());
		const edge = manifest.edges.find((e) => e.from.node === "handbook.pdf");
		const source = manifest.nodes.find((n) => n.id === "handbook.md");

		expect(edge?.sourceHash).toBe(source?.contentHash);
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

describe("buildManifest (extensions)", () => {
	const dirs: string[] = [];

	/** A copy of the docs fixture in a writable temp dir, plus extra files. */
	function projectWith(files: Record<string, string>): string {
		const dir = mkdtempSync(resolve(tmpdir(), "weft-extensions-"));
		dirs.push(dir);
		cpSync(resolve(FIXTURES_DIR, "docs"), resolve(dir, "docs"), { recursive: true });
		for (const [name, content] of Object.entries(files)) {
			writeFileSync(resolve(dir, "docs", name), content);
		}
		return dir;
	}

	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it("indexes a configured extension exactly as a built-in one", async () => {
		const dir = projectWith({
			"notes.qmd": "---\ntitle: Field Notes\n---\n\n# Field Notes\n\nBody.\n",
		});
		const manifest = await buildManifest(
			fixtureConfig({ rootDir: dir, extensions: { ".qmd": "markdown" } })
		);

		const node = manifest.nodes.find((n) => n.id === "notes.qmd");
		expect(node?.type).toBe("markdown");
		expect(node?.title).toBe("Field Notes");
		expect(node?.anchors.map((a) => a.slug)).toContain("#field-notes");
	});

	it("leaves an extension neither built in nor configured un-indexed", async () => {
		const dir = projectWith({ "notes.txt": "plain text, not a doc type Weft knows" });
		const manifest = await buildManifest(fixtureConfig({ rootDir: dir }));

		expect(manifest.nodes.map((n) => n.id)).not.toContain("notes.txt");
	});

	it("does not index .json by default", async () => {
		const dir = projectWith({
			"spec.json": JSON.stringify({ openapi: "3.0.0", info: { title: "Spec" }, paths: {} }),
		});
		const manifest = await buildManifest(fixtureConfig({ rootDir: dir }));

		expect(manifest.nodes.map((n) => n.id)).not.toContain("spec.json");
	});

	it("indexes .json as openapi when explicitly configured", async () => {
		const dir = projectWith({
			"spec.json": JSON.stringify({
				openapi: "3.0.0",
				info: { title: "Spec" },
				paths: { "/users": { get: { operationId: "listUsers" } } },
			}),
		});
		const manifest = await buildManifest(
			fixtureConfig({ rootDir: dir, extensions: { ".json": "openapi" } })
		);

		const node = manifest.nodes.find((n) => n.id === "spec.json");
		expect(node?.type).toBe("openapi");
		expect(node?.anchors.map((a) => a.slug)).toContain("#listUsers");
	});
});
