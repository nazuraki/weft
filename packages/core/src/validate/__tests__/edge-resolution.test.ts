import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildManifest } from "../../manifest.js";
import type { Anchor, Manifest, WeftConfig, WeftEdge, WeftNode } from "../../types.js";
import { ValidatorRegistry } from "../registry.js";
import { edgeResolutionValidator } from "../rules/edge-resolution.js";
import { validateManifest } from "../run.js";

function anchor(slug: string, text = slug.slice(1)): Anchor {
	return { slug, text, line: 1, level: 2 };
}

function node(id: string, anchors: Anchor[] = []): WeftNode {
	return { id, type: "markdown", title: id, anchors };
}

function edge(from: string, to: string, extra: Partial<WeftEdge> = {}): WeftEdge {
	const [fromNode, fromAnchor] = from.split(/(?=#)/);
	const [toNode, toAnchor] = to.split(/(?=#)/);
	return {
		from: { node: fromNode, ...(fromAnchor ? { anchor: fromAnchor } : {}) },
		to: { node: toNode, ...(toAnchor ? { anchor: toAnchor } : {}) },
		type: "references",
		...extra,
	};
}

const CONFIG: WeftConfig = {
	rootDir: "/project",
	docsDir: "docs",
	entryPoint: "docs/README.md",
	ignore: [],
};

/** Run only this validator, so the assertions are about it alone. */
async function check(manifest: Manifest, config: WeftConfig = CONFIG) {
	const registry = new ValidatorRegistry().register(edgeResolutionValidator);
	return validateManifest(manifest, config, registry);
}

function graph(nodes: WeftNode[], edges: WeftEdge[]): Manifest {
	return { version: 2, nodes, edges };
}

describe("edge resolution", () => {
	it("reports nothing when every edge resolves", async () => {
		const manifest = graph(
			[node("README.md"), node("api.md", [anchor("#users")])],
			[edge("README.md", "api.md#users")]
		);

		expect((await check(manifest)).diagnostics).toEqual([]);
	});

	it("reports an edge whose target document is not in the graph", async () => {
		const manifest = graph([node("README.md")], [edge("README.md", "gone.md")]);

		const [diagnostic] = (await check(manifest)).diagnostics;
		expect(diagnostic.rule).toBe("edge-target-missing");
		expect(diagnostic.severity).toBe("error");
		// The location lives on the diagnostic's target, so the message does not
		// repeat it — the reporter renders both.
		expect(diagnostic.message).toBe("No document gone.md is in the graph");
		expect(diagnostic.target).toEqual({ kind: "edge", edge: expect.objectContaining({}) });
		expect(diagnostic.data?.target).toBe("gone.md");
	});

	it("distinguishes a missing anchor from a missing document", async () => {
		const manifest = graph(
			[node("README.md"), node("api.md", [anchor("#users")])],
			[edge("README.md", "api.md#accounts")]
		);

		const [diagnostic] = (await check(manifest)).diagnostics;
		// The two have different causes and different fixes, so they are
		// different rules rather than one "broken link".
		expect(diagnostic.rule).toBe("edge-anchor-missing");
		expect(diagnostic.message).toContain("exists but defines no anchor #accounts");
	});

	it("reports a source anchor the linking document does not define", async () => {
		const manifest = graph(
			[node("README.md", [anchor("#intro")]), node("api.md")],
			[edge("README.md#nope", "api.md")]
		);

		const [diagnostic] = (await check(manifest)).diagnostics;
		expect(diagnostic.rule).toBe("edge-source-anchor-missing");
		expect(diagnostic.message).toContain("README.md defines no anchor #nope");
	});

	it("carries the edge itself as the diagnostic target", async () => {
		const broken = edge("README.md", "gone.md");
		const manifest = graph([node("README.md")], [broken]);

		const [diagnostic] = (await check(manifest)).diagnostics;
		expect(diagnostic.target).toEqual({ kind: "edge", edge: broken });
	});

	it("reports every unresolved edge, not just the first", async () => {
		const manifest = graph(
			[node("README.md")],
			[edge("README.md", "a.md"), edge("README.md", "b.md")]
		);

		expect((await check(manifest)).counts.error).toBe(2);
	});
});

describe("edge resolution (link targets that were never nodes)", () => {
	it("ignores a link to a file type the indexer does not index", async () => {
		// extractMarkdownLinks makes an edge for any path inside a docs root, so
		// an image link becomes an edge to a node that could never exist.
		const manifest = graph(
			[node("README.md")],
			[edge("README.md", "assets/diagram.png"), edge("README.md", "spec.pdf")]
		);

		expect((await check(manifest)).diagnostics).toEqual([]);
	});

	it("still reports an indexable target that is missing", async () => {
		const manifest = graph([node("README.md")], [edge("README.md", "guide.md")]);

		expect((await check(manifest)).counts.error).toBe(1);
	});

	it("checks yaml targets alongside markdown ones", async () => {
		const manifest = graph([node("README.md")], [edge("README.md", "api.yaml")]);

		expect((await check(manifest)).diagnostics[0].rule).toBe("edge-target-missing");
	});
});

describe("edge resolution (rename suggestions)", () => {
	it("suggests the anchor a reworded heading most likely became", async () => {
		const manifest = graph(
			[
				node("README.md"),
				node("impl.md", [{ slug: "#layout--presenting-mode", text: "Layout — Presenting Mode" }]),
			],
			[edge("README.md", "impl.md#layout-presenting-mode")]
		);

		const [diagnostic] = (await check(manifest)).diagnostics;
		expect(diagnostic.hint).toContain("#layout--presenting-mode");
		expect(diagnostic.hint).toContain("Layout — Presenting Mode");
		expect(diagnostic.data?.suggestion).toBe("#layout--presenting-mode");
	});

	it("says the section looks removed when nothing is similar", async () => {
		const manifest = graph(
			[node("README.md"), node("api.md", [anchor("#authentication")])],
			[edge("README.md", "api.md#deployment-topology")]
		);

		const [diagnostic] = (await check(manifest)).diagnostics;
		expect(diagnostic.hint).toContain("removed");
		expect(diagnostic.data?.suggestion).toBeUndefined();
	});

	it("picks the closest of several candidates", async () => {
		const manifest = graph(
			[
				node("README.md"),
				node("api.md", [anchor("#data-flows"), anchor("#deployment"), anchor("#security")]),
			],
			[edge("README.md", "api.md#data-flow")]
		);

		expect((await check(manifest)).diagnostics[0].data?.suggestion).toBe("#data-flows");
	});

	it("suggests a replacement for a broken source anchor too", async () => {
		const manifest = graph(
			[node("README.md", [anchor("#getting-started")]), node("api.md")],
			[edge("README.md#getting-strated", "api.md")]
		);

		expect((await check(manifest)).diagnostics[0].data?.suggestion).toBe("#getting-started");
	});
});

describe("edge resolution (pending references)", () => {
	const pending = { pending: true } as const;

	it("reports a pending edge separately rather than as breakage", async () => {
		const manifest = graph([node("README.md")], [edge("README.md", "appendix.md", pending)]);

		const { diagnostics, counts } = await check(manifest);
		// Writing a pointer to something you are about to create is normal
		// practice; a check that cannot express it gets switched off.
		expect(diagnostics[0].rule).toBe("edge-pending");
		expect(diagnostics[0].severity).toBe("info");
		expect(counts.error).toBe(0);
	});

	it("keeps pending references visible and countable", async () => {
		const manifest = graph(
			[node("README.md")],
			[edge("README.md", "a.md", pending), edge("README.md", "b.md", pending)]
		);

		const { counts } = await check(manifest);
		expect(counts.info).toBe(2);
	});

	it("covers a pending anchor as well as a pending document", async () => {
		const manifest = graph(
			[node("README.md"), node("api.md", [anchor("#users")])],
			[edge("README.md", "api.md#accounts", pending)]
		);

		const [diagnostic] = (await check(manifest)).diagnostics;
		expect(diagnostic.rule).toBe("edge-pending");
		expect(diagnostic.message).toContain("anchor does not exist yet");
	});

	it("reports a pending marker that is no longer needed", async () => {
		const manifest = graph(
			[node("README.md"), node("api.md", [anchor("#users")])],
			[edge("README.md", "api.md#users", pending)]
		);

		const [diagnostic] = (await check(manifest)).diagnostics;
		// Otherwise the suppression outlives the reason for it.
		expect(diagnostic.rule).toBe("edge-pending-resolved");
		expect(diagnostic.message).toContain("can be removed");
	});

	it("lets a project silence pending notices without losing the real errors", async () => {
		const manifest = graph(
			[node("README.md")],
			[edge("README.md", "later.md", pending), edge("README.md", "gone.md")]
		);

		const result = await check(manifest, { ...CONFIG, rules: { "edge-pending": "off" } });
		expect(result.diagnostics.map((d) => d.rule)).toEqual(["edge-target-missing"]);
	});

	it("can be promoted to an error for a project that wants no pending links", async () => {
		const manifest = graph([node("README.md")], [edge("README.md", "later.md", pending)]);

		const result = await check(manifest, { ...CONFIG, rules: { "edge-pending": "error" } });
		expect(result.counts.error).toBe(1);
	});
});

// Extraction and validation exercised together over real files, since the
// check is only as good as the edges the indexer hands it.
describe("edge resolution (over a real docs tree)", () => {
	const BROKEN_DIR = resolve(fileURLToPath(import.meta.url), "../../../__fixtures__/broken");

	const config: WeftConfig = {
		rootDir: BROKEN_DIR,
		docsDir: "docs",
		entryPoint: "docs/README.md",
		ignore: [],
	};

	async function checkFixture() {
		return check(await buildManifest(config), config);
	}

	it("reports each unresolved reference once, by rule", async () => {
		const { diagnostics } = await checkFixture();

		expect(diagnostics.map((d) => d.rule).sort()).toEqual([
			"edge-anchor-missing",
			"edge-pending",
			"edge-source-anchor-missing",
			"edge-target-missing",
		]);
	});

	it("fails a build on the real breakage but not on the pending reference", async () => {
		const { counts } = await checkFixture();

		expect(counts).toEqual({ error: 3, warn: 0, info: 1 });
	});

	it("does not report the image link, which was never going to be a node", async () => {
		const { diagnostics } = await checkFixture();
		const reported = diagnostics.map((d) =>
			d.target.kind === "edge" ? d.target.edge.to.node : ""
		);

		expect(reported).not.toContain("assets/diagram.png");
	});

	it("says which document and which anchor, for the anchor case", async () => {
		const { diagnostics } = await checkFixture();
		const anchorMissing = diagnostics.find((d) => d.rule === "edge-anchor-missing");

		expect(anchorMissing?.message).toContain("guide.md");
		expect(anchorMissing?.message).toContain("#deployment-topology");
		expect(anchorMissing?.data?.target).toBe("guide.md");
	});

	it("leaves the resolving link alone", async () => {
		const { diagnostics } = await checkFixture();
		const reported = diagnostics.map((d) =>
			d.target.kind === "edge" ? `${d.target.edge.to.node}${d.target.edge.to.anchor ?? ""}` : ""
		);

		expect(reported).not.toContain("guide.md#getting-started");
	});
});
