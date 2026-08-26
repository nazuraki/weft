import { describe, expect, it } from "vitest";
import type { Manifest, WeftEdge, WeftNode } from "../../types.js";
import { ValidatorRegistry } from "../registry.js";
import { includeValidator } from "../rules/includes.js";
import { validateManifest } from "../run.js";

const CONFIG = {
	rootDir: "/project",
	docsDir: "docs",
	entryPoint: "docs/README.md",
	ignore: [],
};

function doc(id: string): WeftNode {
	return { id, type: "markdown", title: id, anchors: [] };
}

function includes(from: string, to: string, extra: Partial<WeftEdge> = {}): WeftEdge {
	return { from: { node: from }, to: { node: to }, type: "includes", ...extra };
}

function graph(edges: WeftEdge[]): Manifest {
	const ids = new Set(edges.flatMap((e) => [e.from.node, e.to.node]));
	return { version: 2, nodes: [...ids].map(doc), edges };
}

/** Run only this validator, so the assertions are about it alone. */
async function check(manifest: Manifest) {
	const registry = new ValidatorRegistry().register(includeValidator);
	return validateManifest(manifest, CONFIG, registry);
}

describe("include-cycle", () => {
	it("reports nothing for an acyclic include chain", async () => {
		const manifest = graph([
			includes("faq.md", "runbook.md"),
			includes("faq.md", "pricing.md"),
			includes("overview.md", "faq.md"),
		]);

		expect((await check(manifest)).diagnostics).toEqual([]);
	});

	it("reports a two-document cycle once", async () => {
		const manifest = graph([includes("a.md", "b.md"), includes("b.md", "a.md")]);
		const { diagnostics } = await check(manifest);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].rule).toBe("include-cycle");
		expect(diagnostics[0].severity).toBe("error");
		expect(diagnostics[0].data?.nodes).toEqual(["a.md", "b.md"]);
	});

	it("reports a document that includes itself", async () => {
		const { diagnostics } = await check(graph([includes("a.md", "a.md")]));

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].data?.nodes).toEqual(["a.md"]);
	});

	it("cycles at document granularity even when the edges select anchors", async () => {
		// The two ranges may not actually overlap, but proving that would mean a
		// second range-extraction implementation kept in agreement forever.
		const manifest = graph([
			includes("a.md", "b.md", { to: { node: "b.md", anchor: "#one" } }),
			includes("b.md", "a.md", { to: { node: "a.md", anchor: "#two" } }),
		]);

		expect((await check(manifest)).diagnostics).toHaveLength(1);
	});

	it("reports each disjoint cycle separately", async () => {
		const manifest = graph([
			includes("a.md", "b.md"),
			includes("b.md", "a.md"),
			includes("x.md", "y.md"),
			includes("y.md", "z.md"),
			includes("z.md", "x.md"),
		]);
		const { diagnostics } = await check(manifest);

		expect(diagnostics).toHaveLength(2);
		const groups = diagnostics.map((d) => d.data?.nodes);
		expect(groups).toContainEqual(["a.md", "b.md"]);
		expect(groups).toContainEqual(["x.md", "y.md", "z.md"]);
	});

	it("ignores pending include edges", async () => {
		const manifest = graph([includes("a.md", "b.md"), includes("b.md", "a.md", { pending: true })]);

		expect((await check(manifest)).diagnostics).toEqual([]);
	});

	it("ignores cycles in other edge types", async () => {
		const manifest = graph([
			{ from: { node: "a.md" }, to: { node: "b.md" }, type: "references" },
			{ from: { node: "b.md" }, to: { node: "a.md" }, type: "references" },
		]);

		expect((await check(manifest)).diagnostics).toEqual([]);
	});

	it("finds a cycle reachable only through an acyclic prefix", async () => {
		const manifest = graph([
			includes("entry.md", "a.md"),
			includes("a.md", "b.md"),
			includes("b.md", "a.md"),
		]);
		const { diagnostics } = await check(manifest);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].data?.nodes).toEqual(["a.md", "b.md"]);
	});
});
