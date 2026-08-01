import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildManifest } from "../../manifest.js";
import type { Assertions, Manifest, WeftConfig, WeftEdge, WeftNode } from "../../types.js";
import { ValidatorRegistry } from "../registry.js";
import { assertionValidator } from "../rules/assertions.js";
import { validateManifest } from "../run.js";

const CONFIG: WeftConfig = {
	rootDir: "/project",
	docsDir: "docs",
	entryPoint: "docs/README.md",
	ignore: [],
};

function node(id: string, extra: Partial<WeftNode> = {}): WeftNode {
	return { id, type: "markdown", title: id, anchors: [], ...extra };
}

function asserting(asserts: Assertions, extra: Partial<WeftEdge> = {}): WeftEdge {
	return {
		from: { node: "README.md" },
		to: { node: "spec.md" },
		type: "references",
		asserts,
		...extra,
	};
}

/** Run only this validator, so the assertions are about it alone. */
async function check(manifest: Manifest, config: WeftConfig = CONFIG) {
	const registry = new ValidatorRegistry().register(assertionValidator);
	return validateManifest(manifest, config, registry);
}

/** A graph of README.md plus one target, with README asserting something about it. */
function claim(asserts: Assertions, target: Partial<WeftNode>, extra: Partial<WeftEdge> = {}) {
	const manifest: Manifest = {
		version: 2,
		nodes: [node("README.md"), node("spec.md", target)],
		edges: [asserting(asserts, extra)],
	};
	return check(manifest);
}

describe("assertions (version)", () => {
	it("reports nothing when the asserted version is current", async () => {
		expect((await claim({ version: "2.42" }, { version: "2.42" })).diagnostics).toEqual([]);
	});

	it("reports a version that has moved on", async () => {
		const [diagnostic] = (await claim({ version: "2.41" }, { version: "2.42" })).diagnostics;

		expect(diagnostic.rule).toBe("assert-version-mismatch");
		expect(diagnostic.message).toBe("spec.md is version 2.42, not 2.41");
		expect(diagnostic.data).toMatchObject({ asserted: "2.41", actual: "2.42" });
	});

	it("fails a build by default, because a stale version pointer reads as current", async () => {
		expect((await claim({ version: "2.41" }, { version: "2.42" })).counts.error).toBe(1);
	});

	it("names the edge, so the reporter can say which document made the claim", async () => {
		const [diagnostic] = (await claim({ version: "2.41" }, { version: "2.42" })).diagnostics;

		expect(diagnostic.target).toMatchObject({
			kind: "edge",
			edge: { from: { node: "README.md" }, to: { node: "spec.md" } },
		});
	});

	it("suggests the version the assertion should now carry", async () => {
		const [diagnostic] = (await claim({ version: "2.41" }, { version: "2.42" })).diagnostics;

		expect(diagnostic.hint).toContain("2.42");
	});

	it("compares as written, so 2.40 and 2.4 are different versions", async () => {
		expect((await claim({ version: "2.4" }, { version: "2.40" })).counts.error).toBe(1);
	});

	it("reports an assertion against a document that declares no version as unverifiable", async () => {
		const [diagnostic] = (await claim({ version: "1.0" }, {})).diagnostics;

		// Nothing is known to be wrong — but the author believes they have a
		// check here, and they do not.
		expect(diagnostic.rule).toBe("assert-unverifiable");
		expect(diagnostic.severity).toBe("warn");
		expect(diagnostic.message).toContain("declares no version");
	});
});

describe("assertions (line count)", () => {
	it("accepts an exact count that still holds", async () => {
		expect((await claim({ lineCount: 4082 }, { lineCount: 4082 })).diagnostics).toEqual([]);
	});

	it("reports an exact count that has drifted by a single line", async () => {
		const [diagnostic] = (await claim({ lineCount: 4082 }, { lineCount: 4083 })).diagnostics;

		expect(diagnostic.rule).toBe("assert-line-count-mismatch");
		expect(diagnostic.message).toBe("spec.md has 4083 lines, not 4082");
	});

	it("warns rather than failing, since length drifts with every ordinary edit", async () => {
		const { counts } = await claim({ lineCount: 4082 }, { lineCount: 4083 });

		expect(counts).toMatchObject({ error: 0, warn: 1 });
	});

	it("accepts an approximate count that is within ten percent", async () => {
		// "roughly 3,500 lines" is what prose actually claims, and an exact match
		// would make the tolerance the author intended unexpressible.
		expect((await claim({ lineCount: "~3500" }, { lineCount: 3675 })).diagnostics).toEqual([]);
	});

	it("accepts an approximate count that is short by the same margin", async () => {
		expect((await claim({ lineCount: "~3500" }, { lineCount: 3325 })).diagnostics).toEqual([]);
	});

	it("reports an approximate count once the drift exceeds the tolerance", async () => {
		const [diagnostic] = (await claim({ lineCount: "~3500" }, { lineCount: 4060 })).diagnostics;

		expect(diagnostic.rule).toBe("assert-line-count-mismatch");
		expect(diagnostic.message).toBe("spec.md has 4060 lines, not ~3500");
	});

	it("reports the real case the issue was filed over", async () => {
		// A document told external readers to expect roughly 3,500 lines in a
		// companion document. The actual count was 4,082.
		expect((await claim({ lineCount: "~3500" }, { lineCount: 4082 })).counts.warn).toBe(1);
	});

	it("offers a wider tolerance when the assertion was approximate", async () => {
		const [diagnostic] = (await claim({ lineCount: "~3500" }, { lineCount: 4082 })).diagnostics;

		expect(diagnostic.hint).toContain("~4082");
	});

	it("accepts a count written as a string", async () => {
		expect((await claim({ lineCount: "4082" }, { lineCount: 4082 })).diagnostics).toEqual([]);
	});

	it("reports a count that is not a number as unverifiable", async () => {
		const [diagnostic] = (await claim({ lineCount: "about 3500" }, { lineCount: 4082 }))
			.diagnostics;

		expect(diagnostic.rule).toBe("assert-unverifiable");
		expect(diagnostic.hint).toContain("~3500");
	});

	it("reports a count asserted against a node that has none", async () => {
		const [diagnostic] = (await claim({ lineCount: 100 }, {})).diagnostics;

		expect(diagnostic.rule).toBe("assert-unverifiable");
		expect(diagnostic.message).toContain("no line count");
	});
});

describe("assertions (modified date)", () => {
	const modified = "2026-07-30T15:04:55+01:00";

	it("accepts a month that matches", async () => {
		expect((await claim({ modified: "2026-07" }, { modified })).diagnostics).toEqual([]);
	});

	it("accepts a full day that matches", async () => {
		expect((await claim({ modified: "2026-07-30" }, { modified })).diagnostics).toEqual([]);
	});

	it("accepts the exact timestamp", async () => {
		expect((await claim({ modified }, { modified })).diagnostics).toEqual([]);
	});

	it("reports a month that no longer matches", async () => {
		const [diagnostic] = (await claim({ modified: "2026-06" }, { modified })).diagnostics;

		expect(diagnostic.rule).toBe("assert-modified-mismatch");
		expect(diagnostic.message).toContain("2026-07-30");
		expect(diagnostic.data).toMatchObject({ asserted: "2026-06", actual: modified });
	});

	it("reports a day within a matching month", async () => {
		expect((await claim({ modified: "2026-07-29" }, { modified })).counts.warn).toBe(1);
	});

	it("reports an assertion against an uncommitted document as unverifiable", async () => {
		const [diagnostic] = (await claim({ modified: "2026-07" }, {})).diagnostics;

		expect(diagnostic.rule).toBe("assert-unverifiable");
		expect(diagnostic.message).toContain("no modification date");
	});
});

describe("assertions (scope and configuration)", () => {
	it("reports a property no node has as unverifiable", async () => {
		const [diagnostic] = (
			await claim({ author: "someone" } as unknown as Assertions, { version: "2.42" })
		).diagnostics;

		expect(diagnostic.rule).toBe("assert-unverifiable");
		expect(diagnostic.message).toContain("no node property is called author");
	});

	it("checks every property a single link asserts", async () => {
		const { diagnostics } = await claim(
			{ version: "2.41", lineCount: 100 },
			{ version: "2.42", lineCount: 200 }
		);

		expect(diagnostics.map((d) => d.rule).sort()).toEqual([
			"assert-line-count-mismatch",
			"assert-version-mismatch",
		]);
	});

	it("leaves an edge that asserts nothing alone", async () => {
		const manifest: Manifest = {
			version: 2,
			nodes: [node("README.md"), node("spec.md", { version: "2.42" })],
			edges: [{ from: { node: "README.md" }, to: { node: "spec.md" }, type: "references" }],
		};

		expect((await check(manifest)).diagnostics).toEqual([]);
	});

	it("says nothing about an assertion whose target is not in the graph", async () => {
		// Whether the link resolves at all is edge-resolution's finding, and
		// reporting it twice says nothing new.
		const manifest: Manifest = {
			version: 2,
			nodes: [node("README.md")],
			edges: [asserting({ version: "2.41" })],
		};

		expect((await check(manifest)).diagnostics).toEqual([]);
	});

	it("says nothing about an assertion on a pending link", async () => {
		// The target is known not to exist yet, so its version cannot have moved.
		const { diagnostics } = await claim(
			{ version: "2.41" },
			{ version: "2.42" },
			{ pending: true }
		);

		expect(diagnostics).toEqual([]);
	});

	it("lets a project drop length claims while keeping version checking", async () => {
		const manifest: Manifest = {
			version: 2,
			nodes: [node("README.md"), node("spec.md", { version: "2.42", lineCount: 200 })],
			edges: [asserting({ version: "2.41", lineCount: 100 })],
		};

		const result = await check(manifest, {
			...CONFIG,
			rules: { "assert-line-count-mismatch": "off" },
		});
		expect(result.diagnostics.map((d) => d.rule)).toEqual(["assert-version-mismatch"]);
	});

	it("lets a project promote a length claim to a build failure", async () => {
		const result = await check(
			{
				version: 2,
				nodes: [node("README.md"), node("spec.md", { lineCount: 200 })],
				edges: [asserting({ lineCount: 100 })],
			},
			{ ...CONFIG, rules: { "assert-line-count-mismatch": "error" } }
		);

		expect(result.counts.error).toBe(1);
	});
});

// Extraction and checking exercised together over real files, since the check is
// only as good as the assertions the indexer hands it.
describe("assertions (over a real docs tree)", () => {
	const FIXTURE = resolve(fileURLToPath(import.meta.url), "../../../__fixtures__/assertions");

	const config: WeftConfig = {
		rootDir: FIXTURE,
		docsDir: "docs",
		entryPoint: "docs/README.md",
		ignore: [],
	};

	async function checkFixture() {
		return check(await buildManifest(config), config);
	}

	it("captures the version a document declares in its frontmatter", async () => {
		const manifest = await buildManifest(config);

		expect(manifest.nodes.find((n) => n.id === "spec.md")?.version).toBe("2.42");
	});

	it("leaves a document that declares no version without one", async () => {
		const manifest = await buildManifest(config);

		expect(manifest.nodes.find((n) => n.id === "registry.md")?.version).toBeUndefined();
	});

	it("reports each stale claim once, by rule", async () => {
		const { diagnostics } = await checkFixture();

		expect(diagnostics.map((d) => d.rule).sort()).toEqual([
			"assert-line-count-mismatch",
			"assert-unverifiable",
			"assert-version-mismatch",
		]);
	});

	it("fails the build on the stale version but not on the length claim", async () => {
		expect((await checkFixture()).counts).toEqual({ error: 1, warn: 2, info: 0 });
	});

	it("reports the length the document actually has", async () => {
		const manifest = await buildManifest(config);
		const spec = manifest.nodes.find((n) => n.id === "spec.md");
		const diagnostic = (await check(manifest, config)).diagnostics.find(
			(d) => d.rule === "assert-line-count-mismatch"
		);

		expect(diagnostic?.data?.actual).toBe(spec?.lineCount);
	});

	it("leaves the claim that is still true alone", async () => {
		const { diagnostics } = await checkFixture();
		const anchors = diagnostics.map((d) =>
			d.target.kind === "edge" ? d.target.edge.to.anchor : undefined
		);

		// The link asserting the current version points at #errors.
		expect(anchors).not.toContain("#errors");
	});
});
