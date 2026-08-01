import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type LoadedContribution,
	applyContributions,
	loadContributions,
	validateContribution,
} from "./contributions.js";
import type { Anchor, WeftConfig, WeftEdge, WeftNode } from "./types.js";

const dirs: string[] = [];

function tempRoot(files: Record<string, string> = {}): string {
	const dir = mkdtempSync(join(tmpdir(), "weft-contrib-"));
	dirs.push(dir);
	for (const [name, content] of Object.entries(files)) {
		writeFileSync(join(dir, name), content);
	}
	return dir;
}

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	vi.restoreAllMocks();
});

function config(root: string, contributions?: string[]): WeftConfig {
	return {
		rootDir: resolve(root),
		docsDir: "docs",
		entryPoint: "docs/README.md",
		ignore: [],
		...(contributions ? { contributions } : {}),
	};
}

function node(id: string, extra: Partial<WeftNode> = {}): WeftNode {
	return { id, type: "markdown", title: id, anchors: [] as Anchor[], ...extra };
}

function loaded(contribution: object, file = "build/weft.json"): LoadedContribution {
	return { contribution: validateContribution({ version: 1, ...contribution }, file), file };
}

describe("validateContribution", () => {
	it("accepts a minimal contribution", () => {
		expect(validateContribution({ version: 1 }, "c.json")).toEqual({
			version: 1,
			nodes: [],
			edges: [],
			metadata: {},
		});
	});

	it("keeps the producing tool for traceability", () => {
		expect(validateContribution({ version: 1, tool: "quarto 1.4" }, "c.json").tool).toBe(
			"quarto 1.4"
		);
	});

	it("rejects a wrong schema version, naming the file", () => {
		expect(() => validateContribution({ version: 99 }, "c.json")).toThrow(
			/"version" must be 1.*in c\.json/s
		);
	});

	it("rejects a non-mapping top level", () => {
		expect(() => validateContribution([], "c.json")).toThrow(/top-level mapping/);
	});

	it("defaults a contributed node's title and anchors", () => {
		const { nodes } = validateContribution(
			{ version: 1, nodes: [{ id: "gen.md", type: "markdown" }] },
			"c.json"
		);

		expect(nodes?.[0]).toEqual({ id: "gen.md", type: "markdown", title: "gen.md", anchors: [] });
	});

	it("rejects a node without an id or with an unknown type", () => {
		expect(() => validateContribution({ version: 1, nodes: [{ type: "markdown" }] }, "c")).toThrow(
			/nodes\[0\] is missing "id"/
		);
		expect(() =>
			validateContribution({ version: 1, nodes: [{ id: "a.md", type: "prose" }] }, "c")
		).toThrow(/must have type "markdown", "openapi", "artifact"/);
	});

	it("accepts a contributed artifact", () => {
		// The build is the only party that knows what it generated, and a
		// generated output is never discoverable by indexing source.
		const { nodes } = validateContribution(
			{ version: 1, nodes: [{ id: "out/guide.pdf", type: "artifact", hiddenFromNav: true }] },
			"c.json"
		);

		expect(nodes?.[0]).toMatchObject({ id: "out/guide.pdf", type: "artifact" });
	});

	it("accepts a contributed derives-from edge carrying a source hash", () => {
		const { edges } = validateContribution(
			{
				version: 1,
				edges: [
					{
						from: { node: "out/guide.pdf" },
						to: { node: "guide.md" },
						type: "derives-from",
						sourceHash: "abc123abc123abc1",
					},
				],
			},
			"c.json"
		);

		expect(edges?.[0].sourceHash).toBe("abc123abc123abc1");
	});

	it("defaults a contributed edge's type", () => {
		const { edges } = validateContribution(
			{ version: 1, edges: [{ from: { node: "a.md" }, to: { node: "b.md" } }] },
			"c.json"
		);

		expect(edges?.[0].type).toBe("references");
	});

	it("rejects an edge missing an endpoint node", () => {
		expect(() =>
			validateContribution({ version: 1, edges: [{ from: { node: "a.md" }, to: {} }] }, "c")
		).toThrow(/edges\[0\] needs a "to\.node" string/);
	});

	it("rejects a metadata patch touching extraction output or identity", () => {
		for (const field of ["id", "type", "anchors", "project"]) {
			expect(() =>
				validateContribution({ version: 1, metadata: { "a.md": { [field]: "x" } } }, "c")
			).toThrow(new RegExp(`cannot set "${field}"`));
		}
	});

	it("accepts the patchable fields", () => {
		const { metadata } = validateContribution(
			{
				version: 1,
				metadata: { "a.md": { title: "Resolved", contentHash: "abc", lineCount: 12 } },
			},
			"c.json"
		);

		expect(metadata?.["a.md"]).toEqual({ title: "Resolved", contentHash: "abc", lineCount: 12 });
	});
});

describe("loadContributions", () => {
	it("returns nothing when none are configured", async () => {
		expect(await loadContributions(config(tempRoot()))).toEqual([]);
	});

	it("reads a configured JSON contribution", async () => {
		const root = tempRoot({
			"weft-build.json": JSON.stringify({ version: 1, tool: "renderer", nodes: [] }),
		});

		const [first] = await loadContributions(config(root, ["weft-build.json"]));
		expect(first.contribution.tool).toBe("renderer");
		expect(first.file).toBe("weft-build.json");
	});

	it("reads YAML as well, since the parser is shared with config", async () => {
		const root = tempRoot({ "c.yaml": "version: 1\ntool: sphinx\n" });

		const [first] = await loadContributions(config(root, ["c.yaml"]));
		expect(first.contribution.tool).toBe("sphinx");
	});

	it("resolves globs in sorted order, so a merge is reproducible", async () => {
		const root = tempRoot({
			"b.json": JSON.stringify({ version: 1, tool: "b" }),
			"a.json": JSON.stringify({ version: 1, tool: "a" }),
		});

		const files = await loadContributions(config(root, ["*.json"]));
		expect(files.map((f) => f.contribution.tool)).toEqual(["a", "b"]);
	});

	it("ignores a glob that matches nothing", async () => {
		expect(await loadContributions(config(tempRoot(), ["nope/*.json"]))).toEqual([]);
	});

	it("reports a malformed file by name", async () => {
		const root = tempRoot({ "c.json": "{ this is not valid" });
		await expect(loadContributions(config(root, ["c.json"]))).rejects.toThrow(/c\.json/);
	});
});

describe("applyContributions", () => {
	const base = () => ({
		nodes: [node("README.md"), node("api.md")],
		edges: [] as WeftEdge[],
	});

	it("returns the graph untouched when there is nothing to apply", () => {
		const graph = base();
		expect(applyContributions(graph, [])).toBe(graph);
	});

	it("adds a node the build knows about", () => {
		const result = applyContributions(base(), [
			loaded({ nodes: [{ id: "generated.md", type: "markdown", title: "Generated" }] }),
		]);

		expect(result.nodes.map((n) => n.id)).toEqual(["README.md", "api.md", "generated.md"]);
	});

	it("adds edges the build knows about", () => {
		const result = applyContributions(base(), [
			loaded({
				edges: [{ from: { node: "api.md" }, to: { node: "README.md" }, type: "derives-from" }],
			}),
		]);

		expect(result.edges).toHaveLength(1);
		expect(result.edges[0].type).toBe("derives-from");
	});

	it("patches metadata onto an indexed node", () => {
		// What a renderer resolved that source could not express.
		const result = applyContributions(base(), [
			loaded({ metadata: { "api.md": { title: "API v2.41" } } }),
		]);

		expect(result.nodes.find((n) => n.id === "api.md")?.title).toBe("API v2.41");
		expect(result.nodes.find((n) => n.id === "README.md")?.title).toBe("README.md");
	});

	it("leaves fields the patch does not mention alone", () => {
		const graph = { nodes: [node("a.md", { description: "kept", lineCount: 5 })], edges: [] };

		const result = applyContributions(graph, [loaded({ metadata: { "a.md": { lineCount: 9 } } })]);

		expect(result.nodes[0]).toMatchObject({ description: "kept", lineCount: 9 });
	});

	it("warns rather than fails on metadata for an unknown node", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const result = applyContributions(base(), [
			loaded({ metadata: { "ghost.md": { title: "X" } } }),
		]);

		expect(result.nodes).toHaveLength(2);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown node "ghost.md"'));
	});

	it("warns when a contributed node was already indexed from source", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		// The signature of build output landing under docsDir.
		const result = applyContributions(base(), [
			loaded({ nodes: [{ id: "api.md", type: "markdown", title: "Rendered API" }] }),
		]);

		expect(result.nodes).toHaveLength(2);
		expect(result.nodes.find((n) => n.id === "api.md")?.title).toBe("Rendered API");
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("already indexed from source"));
	});

	it("applies contributions in order, so a later one wins", () => {
		const result = applyContributions(base(), [
			loaded({ metadata: { "api.md": { title: "first" } } }, "a.json"),
			loaded({ metadata: { "api.md": { title: "second" } } }, "b.json"),
		]);

		expect(result.nodes.find((n) => n.id === "api.md")?.title).toBe("second");
	});

	it("does not mutate the graph it was given", () => {
		const graph = base();
		applyContributions(graph, [loaded({ nodes: [{ id: "new.md", type: "markdown" }] })]);

		expect(graph.nodes).toHaveLength(2);
	});
});
