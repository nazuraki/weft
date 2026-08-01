import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildManifest } from "../../manifest.js";
import type { Manifest, WeftConfig, WeftEdge, WeftNode } from "../../types.js";
import { ValidatorRegistry } from "../registry.js";
import { artifactValidator } from "../rules/artifacts.js";
import { validateManifest } from "../run.js";

const CONFIG: WeftConfig = {
	rootDir: "/project",
	docsDir: "docs",
	entryPoint: "docs/README.md",
	ignore: [],
};

const CURRENT = "aaaaaaaaaaaaaaaa";
const OLDER = "bbbbbbbbbbbbbbbb";

function source(id: string, contentHash = CURRENT): WeftNode {
	return { id, type: "markdown", title: id, anchors: [], contentHash };
}

/** A source Weft never read, so it carries no hash to compare against. */
function unhashedSource(id: string): WeftNode {
	return { id, type: "markdown", title: id, anchors: [] };
}

function artifact(id: string): WeftNode {
	return { id, type: "artifact", title: id, anchors: [], hiddenFromNav: true };
}

function derives(from: string, to: string, extra: Partial<WeftEdge> = {}): WeftEdge {
	return { from: { node: from }, to: { node: to }, type: "derives-from", ...extra };
}

/** Run only this validator, so the assertions are about it alone. */
async function check(manifest: Manifest, config: WeftConfig = CONFIG) {
	const registry = new ValidatorRegistry().register(artifactValidator);
	return validateManifest(manifest, config, registry);
}

function graph(nodes: WeftNode[], edges: WeftEdge[]): Manifest {
	return { version: 2, nodes, edges };
}

describe("artifact staleness", () => {
	it("reports nothing when the recorded hash still matches", async () => {
		const manifest = graph(
			[artifact("guide.pdf"), source("guide.md")],
			[derives("guide.pdf", "guide.md", { sourceHash: CURRENT })]
		);

		expect((await check(manifest)).diagnostics).toEqual([]);
	});

	it("reports an artifact built from an older source", async () => {
		const manifest = graph(
			[artifact("guide.pdf"), source("guide.md")],
			[derives("guide.pdf", "guide.md", { sourceHash: OLDER })]
		);

		const [diagnostic] = (await check(manifest)).diagnostics;
		expect(diagnostic.rule).toBe("artifact-stale");
		expect(diagnostic.message).toBe("guide.pdf was generated from an older guide.md");
		expect(diagnostic.data).toMatchObject({ generatedFrom: OLDER, current: CURRENT });
	});

	it("fails a build, because the stale copy is the one the audience sees", async () => {
		const manifest = graph(
			[artifact("guide.pdf"), source("guide.md")],
			[derives("guide.pdf", "guide.md", { sourceHash: OLDER })]
		);

		expect((await check(manifest)).counts.error).toBe(1);
	});

	it("suggests regenerating rather than editing the record", async () => {
		const manifest = graph(
			[artifact("guide.pdf"), source("guide.md")],
			[derives("guide.pdf", "guide.md", { sourceHash: OLDER })]
		);

		expect((await check(manifest)).diagnostics[0].hint).toContain("Regenerate guide.pdf");
	});

	it("checks each source of a multi-input artifact on its own", async () => {
		// A stylesheet or template change invalidates an output just as surely as
		// an edit to its document.
		const manifest = graph(
			[artifact("guide.pdf"), source("guide.md"), source("theme.md")],
			[
				derives("guide.pdf", "guide.md", { sourceHash: CURRENT }),
				derives("guide.pdf", "theme.md", { sourceHash: OLDER }),
			]
		);

		const { diagnostics } = await check(manifest);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].data?.source).toBe("theme.md");
	});

	it("reports every stale artifact, not just the first", async () => {
		const manifest = graph(
			[artifact("a.pdf"), artifact("b.pdf"), source("guide.md")],
			[
				derives("a.pdf", "guide.md", { sourceHash: OLDER }),
				derives("b.pdf", "guide.md", { sourceHash: OLDER }),
			]
		);

		expect((await check(manifest)).counts.error).toBe(2);
	});

	it("can be turned down for a project that regenerates on release", async () => {
		const manifest = graph(
			[artifact("guide.pdf"), source("guide.md")],
			[derives("guide.pdf", "guide.md", { sourceHash: OLDER })]
		);

		const result = await check(manifest, { ...CONFIG, rules: { "artifact-stale": "warn" } });
		expect(result.counts).toMatchObject({ error: 0, warn: 1 });
	});
});

describe("artifact staleness (what cannot be checked)", () => {
	it("reports a derives-from edge that records no hash", async () => {
		const manifest = graph(
			[artifact("guide.pdf"), source("guide.md")],
			[derives("guide.pdf", "guide.md")]
		);

		const [diagnostic] = (await check(manifest)).diagnostics;
		expect(diagnostic.rule).toBe("artifact-source-unrecorded");
		expect(diagnostic.message).toContain("No source hash recorded for guide.pdf");
	});

	it("keeps that at info, so plain modelling is not punished", async () => {
		// `derives-from` is also a reasonable way to say two things are related
		// without asking for the relationship to be checked.
		const manifest = graph(
			[artifact("guide.pdf"), source("guide.md")],
			[derives("guide.pdf", "guide.md")]
		);

		expect((await check(manifest)).counts).toMatchObject({ error: 0, warn: 0, info: 1 });
	});

	it("reports a source that has no hash of its own", async () => {
		const manifest = graph(
			[artifact("guide.pdf"), unhashedSource("guide.md")],
			[derives("guide.pdf", "guide.md", { sourceHash: CURRENT })]
		);

		const [diagnostic] = (await check(manifest)).diagnostics;
		expect(diagnostic.rule).toBe("artifact-source-unrecorded");
		expect(diagnostic.message).toContain("guide.md has no content hash");
	});

	it("says nothing when the source is not in the graph", async () => {
		// Whether the edge resolves at all is edge-resolution's finding.
		const manifest = graph(
			[artifact("guide.pdf")],
			[derives("guide.pdf", "gone.md", { sourceHash: OLDER })]
		);

		expect((await check(manifest)).diagnostics).toEqual([]);
	});

	it("says nothing about a pending derives-from edge", async () => {
		const manifest = graph(
			[artifact("guide.pdf"), source("guide.md")],
			[derives("guide.pdf", "guide.md", { sourceHash: OLDER, pending: true })]
		);

		expect((await check(manifest)).diagnostics).toEqual([]);
	});

	it("ignores edges of any other type", async () => {
		const manifest = graph(
			[source("README.md"), source("guide.md")],
			[{ from: { node: "README.md" }, to: { node: "guide.md" }, type: "references" }]
		);

		expect((await check(manifest)).diagnostics).toEqual([]);
	});

	it("ignores a sourceHash on an edge that is not derives-from", async () => {
		// The edge type is what gives the hash its meaning; without it there is no
		// claim that one thing was generated from the other.
		const manifest = graph(
			[source("README.md"), source("guide.md")],
			[
				{
					from: { node: "README.md" },
					to: { node: "guide.md" },
					type: "references",
					sourceHash: OLDER,
				},
			]
		);

		expect((await check(manifest)).diagnostics).toEqual([]);
	});
});

// Extraction and checking exercised together over real files, since the check is
// only as good as the edges and hashes the indexer hands it.
describe("artifact staleness (over a real docs tree)", () => {
	const FIXTURE = resolve(fileURLToPath(import.meta.url), "../../../__fixtures__/artifacts");

	const config: WeftConfig = {
		rootDir: FIXTURE,
		docsDir: "docs",
		entryPoint: "docs/README.md",
		ignore: [],
		artifacts: ["**/*.pdf"],
	};

	async function checkFixture() {
		return check(await buildManifest(config), config);
	}

	it("reports the stale artifact and the unrecorded input, by rule", async () => {
		const { diagnostics } = await checkFixture();

		expect(diagnostics.map((d) => d.rule).sort()).toEqual([
			"artifact-source-unrecorded",
			"artifact-stale",
		]);
	});

	it("fails the build on the stale artifact alone", async () => {
		expect((await checkFixture()).counts).toEqual({ error: 1, warn: 0, info: 1 });
	});

	it("names the artifact and the source it fell behind", async () => {
		const stale = (await checkFixture()).diagnostics.find((d) => d.rule === "artifact-stale");

		expect(stale?.data).toMatchObject({ artifact: "appendix.pdf", source: "appendix.md" });
	});

	it("compares against the source's freshly indexed hash", async () => {
		const manifest = await buildManifest(config);
		const appendix = manifest.nodes.find((n) => n.id === "appendix.md");
		const stale = (await check(manifest, config)).diagnostics.find(
			(d) => d.rule === "artifact-stale"
		);

		expect(stale?.data?.current).toBe(appendix?.contentHash);
	});

	it("leaves the artifact whose recorded hash is current alone", async () => {
		const { diagnostics } = await checkFixture();
		const artifacts = diagnostics.map((d) =>
			d.target.kind === "edge" ? d.target.edge.from.node : ""
		);

		expect(artifacts).not.toContain("handbook.pdf");
	});
});
