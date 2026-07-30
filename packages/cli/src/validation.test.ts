import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Diagnostic, ValidationResult } from "@weft/core";
import { ValidatorRegistry } from "@weft/core";
import { describe, expect, it } from "vitest";
import {
	exitCodeFor,
	formatReport,
	formatRules,
	formatTarget,
	runValidation,
} from "./validation.js";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES_DIR = resolve(__dirname, "__fixtures__");

function result(
	diagnostics: Diagnostic[] = [],
	overrides: Partial<ValidationResult> = {}
): ValidationResult {
	return {
		diagnostics,
		counts: {
			error: diagnostics.filter((d) => d.severity === "error").length,
			warn: diagnostics.filter((d) => d.severity === "warn").length,
			info: diagnostics.filter((d) => d.severity === "info").length,
		},
		rulesRun: ["validator-error"],
		rulesSkipped: [],
		unknownRules: [],
		...overrides,
	};
}

const ERROR_DIAGNOSTIC: Diagnostic = {
	rule: "edge-target-missing",
	severity: "error",
	message: "Target document does not exist",
	target: {
		kind: "edge",
		edge: { from: { node: "README.md" }, to: { node: "gone.md" }, type: "references" },
	},
};

const WARN_DIAGNOSTIC: Diagnostic = {
	rule: "doc-orphaned",
	severity: "warn",
	message: "Nothing links to this document",
	target: { kind: "node", node: "stray.md" },
	hint: "link it from README.md",
};

describe("formatTarget", () => {
	it("renders a node, with its anchor when present", () => {
		expect(formatTarget({ kind: "node", node: "api.md" })).toBe("api.md");
		expect(formatTarget({ kind: "node", node: "api.md", anchor: "#users" })).toBe("api.md#users");
	});

	it("renders an edge as source to target, keeping both anchors", () => {
		expect(
			formatTarget({
				kind: "edge",
				edge: {
					from: { node: "a.md", anchor: "#sync" },
					to: { node: "b.yaml", anchor: "#listUsers" },
					type: "implements",
				},
			})
		).toBe("a.md#sync -> b.yaml#listUsers");
	});

	it("renders a graph-wide target", () => {
		expect(formatTarget({ kind: "graph" })).toBe("(graph)");
	});
});

describe("formatReport", () => {
	it("reports a clean run", () => {
		const text = formatReport(result());

		expect(text).toContain("No problems found.");
		expect(text).toContain("Ran 1 rule.");
	});

	it("lists each diagnostic with its severity, rule id, location and message", () => {
		const text = formatReport(result([ERROR_DIAGNOSTIC]));

		expect(text).toContain("error");
		expect(text).toContain("edge-target-missing");
		expect(text).toContain("README.md -> gone.md");
		expect(text).toContain("Target document does not exist");
	});

	it("includes a hint when the diagnostic carries one", () => {
		expect(formatReport(result([WARN_DIAGNOSTIC]))).toContain("hint: link it from README.md");
	});

	it("orders errors before warnings", () => {
		const text = formatReport(result([WARN_DIAGNOSTIC, ERROR_DIAGNOSTIC]));

		expect(text.indexOf("edge-target-missing")).toBeLessThan(text.indexOf("doc-orphaned"));
	});

	it("summarizes the counts, pluralized", () => {
		expect(formatReport(result([ERROR_DIAGNOSTIC, WARN_DIAGNOSTIC]))).toContain(
			"2 problems (1 error, 1 warning, 0 notes)"
		);
	});

	it("notes how many rules were turned off", () => {
		const text = formatReport(result([], { rulesRun: ["a"], rulesSkipped: ["b", "c"] }));

		expect(text).toContain("Ran 1 rule, 2 off.");
	});

	it("flags config rule ids that no validator declares", () => {
		const text = formatReport(result([], { unknownRules: ["typo-rule"] }));

		expect(text).toContain("unknown rules: typo-rule");
	});

	it("stays ASCII so the cp1252 Windows console can print it", () => {
		const text = formatReport(result([ERROR_DIAGNOSTIC, WARN_DIAGNOSTIC], { unknownRules: ["x"] }));

		// biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the whole ASCII range
		expect(text).toMatch(/^[\x00-\x7F]*$/);
	});

	it("emits the full result as JSON when asked", () => {
		const validation = result([ERROR_DIAGNOSTIC]);
		const parsed = JSON.parse(formatReport(validation, { json: true }));

		expect(parsed).toEqual(validation);
	});
});

describe("formatRules", () => {
	it("lists each rule with its default severity and description", () => {
		const registry = new ValidatorRegistry().register({
			rules: [{ id: "some-check", description: "Checks something", defaultSeverity: "warn" }],
			run: () => [],
		});

		const text = formatRules(registry);

		expect(text).toContain("some-check");
		expect(text).toContain("warn");
		expect(text).toContain("Checks something");
		expect(text).toContain("validator-error");
	});
});

describe("exitCodeFor", () => {
	it("fails on an error diagnostic", () => {
		expect(exitCodeFor(result([ERROR_DIAGNOSTIC]))).toBe(1);
	});

	it("passes on warnings and notes alone", () => {
		expect(exitCodeFor(result([WARN_DIAGNOSTIC]))).toBe(0);
	});

	it("passes on a clean run", () => {
		expect(exitCodeFor(result())).toBe(0);
	});
});

describe("runValidation", () => {
	it("builds the project's graph and runs the given checks over it", async () => {
		const registry = new ValidatorRegistry().register({
			rules: [{ id: "node-count", description: "Counts nodes", defaultSeverity: "info" }],
			run: (context) => [
				{ rule: "node-count", message: `${context.nodes.size} nodes`, target: { kind: "graph" } },
			],
		});

		const validation = await runValidation(FIXTURES_DIR, registry);

		expect(validation.diagnostics.map((d) => d.message)).toEqual(["2 nodes"]);
		expect(validation.counts).toEqual({ error: 0, warn: 0, info: 1 });
	});

	it("finds nothing with the built-in checks, which are not written yet", async () => {
		const validation = await runValidation(FIXTURES_DIR);

		expect(validation.diagnostics).toEqual([]);
		expect(exitCodeFor(validation)).toBe(0);
	});
});
