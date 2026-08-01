import { describe, expect, it } from "vitest";
import type { Manifest, WeftConfig, WeftNode } from "../../types.js";
import { ValidatorRegistry } from "../registry.js";
import { duplicateValidator } from "../rules/duplicates.js";
import { validateManifest } from "../run.js";
import type { GraphHistory } from "../types.js";

const CONFIG: WeftConfig = {
	rootDir: "/project",
	docsDir: "docs",
	entryPoint: "docs/README.md",
	ignore: [],
};

function node(id: string, contentHash?: string): WeftNode {
	return { id, type: "markdown", title: id, anchors: [], ...(contentHash ? { contentHash } : {}) };
}

function history(blobs: Record<string, string[]> = {}): GraphHistory {
	return {
		blobs: new Map(Object.entries(blobs).map(([id, held]) => [id, new Set(held)])),
		renames: new Map(),
	};
}

/**
 * Run only this validator against a fixed history.
 *
 * The runner would otherwise shell out to git for the real one, which would make
 * every case here depend on the checkout it runs in.
 */
async function check(
	nodes: WeftNode[],
	blobs: Record<string, string[]> = {},
	config: WeftConfig = CONFIG
) {
	const manifest: Manifest = { version: 2, nodes, edges: [] };
	const registry = new ValidatorRegistry().register({
		...duplicateValidator,
		run: (context) => duplicateValidator.run({ ...context, history: history(blobs) }),
	});
	return validateManifest(manifest, config, registry);
}

describe("duplicates", () => {
	it("reports two documents holding identical content", async () => {
		const { diagnostics } = await check([node("a.md", "same"), node("outbound/a.md", "same")]);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].rule).toBe("node-duplicate");
		expect(diagnostics[0].data?.nodes).toEqual(["a.md", "outbound/a.md"]);
	});

	it("stays advisory, since copies that agree are not yet wrong", async () => {
		// This is the cheapest moment the problem will ever be visible, but it is
		// not itself a failure.
		const { counts } = await check([node("a.md", "same"), node("outbound/a.md", "same")]);

		expect(counts).toEqual({ error: 0, warn: 0, info: 1 });
	});

	it("reports a group of three copies once, not once per pair", async () => {
		const { diagnostics } = await check([
			node("a.md", "same"),
			node("b.md", "same"),
			node("c.md", "same"),
		]);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].data?.nodes).toEqual(["a.md", "b.md", "c.md"]);
	});

	it("says nothing about documents that differ", async () => {
		const { diagnostics } = await check([node("a.md", "one"), node("b.md", "two")]);

		expect(diagnostics).toEqual([]);
	});

	it("says nothing about a lone document", async () => {
		expect((await check([node("a.md", "one")])).diagnostics).toEqual([]);
	});

	it("ignores nodes carrying no hash at all", async () => {
		// A node an external tool declared may have none, and two unknowns are
		// not evidence of anything.
		const { diagnostics } = await check([node("a.md"), node("b.md")]);

		expect(diagnostics).toEqual([]);
	});

	it("names the graph rather than one of the copies", async () => {
		// Naming one would imply it is the original, and nothing here knows which
		// came first.
		const [diagnostic] = (await check([node("a.md", "same"), node("b.md", "same")])).diagnostics;

		expect(diagnostic.target).toEqual({ kind: "graph" });
	});

	it("can be switched off without touching the divergence check", async () => {
		const result = await check(
			[node("a.md", "same"), node("b.md", "same")],
			{},
			{ ...CONFIG, rules: { "node-duplicate": "off" } }
		);

		expect(result.diagnostics).toEqual([]);
	});
});

describe("divergence", () => {
	it("reports two documents that once held the same content", async () => {
		const { diagnostics } = await check(
			[node("a.md", "now-one"), node("outbound/a.md", "now-two")],
			{
				"a.md": ["shared"],
				"outbound/a.md": ["shared"],
			}
		);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].rule).toBe("node-diverged");
		expect(diagnostics[0].data).toMatchObject({ blob: "shared" });
	});

	it("outranks the duplicate notice, because this is the half that costs", async () => {
		// Exact-match detection goes quiet at precisely the moment drift begins.
		const { counts } = await check([node("a.md", "now-one"), node("b.md", "now-two")], {
			"a.md": ["shared"],
			"b.md": ["shared"],
		});

		expect(counts).toEqual({ error: 0, warn: 1, info: 0 });
	});

	it("reports copies that still agree as duplicates and not as diverged", async () => {
		const { diagnostics } = await check([node("a.md", "same"), node("b.md", "same")], {
			"a.md": ["shared"],
			"b.md": ["shared"],
		});

		expect(diagnostics.map((d) => d.rule)).toEqual(["node-duplicate"]);
	});

	it("says nothing about documents that never shared history", async () => {
		const { diagnostics } = await check([node("a.md", "one"), node("b.md", "two")], {
			"a.md": ["blob-a"],
			"b.md": ["blob-b"],
		});

		expect(diagnostics).toEqual([]);
	});

	it("reports a diverged group once when several blobs were shared", async () => {
		const { diagnostics } = await check([node("a.md", "one"), node("b.md", "two")], {
			"a.md": ["first", "second"],
			"b.md": ["first", "second"],
		});

		expect(diagnostics).toHaveLength(1);
	});

	it("finds nothing without history, rather than guessing", async () => {
		// Outside a git repository the check has nothing to say — which must not
		// read as "these files are fine".
		const { diagnostics } = await check([node("a.md", "one"), node("b.md", "two")]);

		expect(diagnostics).toEqual([]);
	});

	it("can be switched off without losing the duplicate notice", async () => {
		const result = await check(
			[node("a.md", "one"), node("b.md", "two"), node("c.md", "dup"), node("d.md", "dup")],
			{ "a.md": ["shared"], "b.md": ["shared"] },
			{ ...CONFIG, rules: { "node-diverged": "off" } }
		);

		expect(result.diagnostics.map((d) => d.rule)).toEqual(["node-duplicate"]);
	});
});
