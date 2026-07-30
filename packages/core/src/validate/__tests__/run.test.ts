import { describe, expect, it } from "vitest";
import type { Manifest, WeftConfig } from "../../types.js";
import { VALIDATOR_ERROR_RULE, ValidatorRegistry } from "../registry.js";
import { validateManifest } from "../run.js";
import type { Finding, Rule, ValidationContext, Validator } from "../types.js";

const RULE_A: Rule = { id: "rule-a", description: "Checks a", defaultSeverity: "error" };
const RULE_B: Rule = { id: "rule-b", description: "Checks b", defaultSeverity: "warn" };

const MANIFEST: Manifest = {
	version: 1,
	nodes: [
		{ id: "README.md", type: "markdown", title: "Readme", anchors: ["#intro"] },
		{ id: "api.yaml", type: "openapi", title: "API", anchors: ["#listUsers"] },
	],
	edges: [{ from: { node: "README.md" }, to: { node: "api.yaml" }, type: "references" }],
};

function config(overrides: Partial<WeftConfig> = {}): WeftConfig {
	return {
		rootDir: "/project",
		docsDir: "docs",
		entryPoint: "docs/README.md",
		ignore: [],
		...overrides,
	};
}

/** A validator that reports one finding per declared rule. */
function reporting(rules: Rule[], run?: Validator["run"]): Validator {
	return {
		rules,
		run:
			run ??
			(() =>
				rules.map(
					(rule): Finding => ({
						rule: rule.id,
						message: `${rule.id} fired`,
						target: { kind: "graph" },
					})
				)),
	};
}

describe("validateManifest", () => {
	it("collects findings from every registered validator", async () => {
		const registry = new ValidatorRegistry()
			.register(reporting([RULE_A]))
			.register(reporting([RULE_B]));

		const result = await validateManifest(MANIFEST, config(), registry);

		expect(result.diagnostics.map((d) => d.rule)).toEqual(["rule-a", "rule-b"]);
	});

	it("stamps each diagnostic with the rule's default severity", async () => {
		const registry = new ValidatorRegistry().register(reporting([RULE_A, RULE_B]));

		const result = await validateManifest(MANIFEST, config(), registry);

		expect(result.diagnostics.map((d) => [d.rule, d.severity])).toEqual([
			["rule-a", "error"],
			["rule-b", "warn"],
		]);
	});

	it("carries a finding's message, target, hint and data through unchanged", async () => {
		const finding: Finding = {
			rule: RULE_A.id,
			message: "something is wrong",
			target: { kind: "node", node: "README.md", anchor: "#intro" },
			hint: "try this instead",
			data: { expected: 3 },
		};
		const registry = new ValidatorRegistry().register(reporting([RULE_A], () => [finding]));

		const result = await validateManifest(MANIFEST, config(), registry);

		expect(result.diagnostics[0]).toEqual({ ...finding, severity: "error" });
	});

	it("lets config override a rule's severity", async () => {
		const registry = new ValidatorRegistry().register(reporting([RULE_A]));

		const result = await validateManifest(
			MANIFEST,
			config({ rules: { "rule-a": "info" } }),
			registry
		);

		expect(result.diagnostics[0].severity).toBe("info");
		expect(result.rulesRun).toContain("rule-a");
	});

	it("drops the diagnostics of a rule configured off", async () => {
		const registry = new ValidatorRegistry().register(reporting([RULE_A, RULE_B]));

		const result = await validateManifest(
			MANIFEST,
			config({ rules: { "rule-a": "off" } }),
			registry
		);

		expect(result.diagnostics.map((d) => d.rule)).toEqual(["rule-b"]);
		expect(result.rulesSkipped).toEqual(["rule-a"]);
		expect(result.rulesRun).toEqual([VALIDATOR_ERROR_RULE.id, "rule-b"]);
	});

	it("reports isEnabled as false for a rule configured off", async () => {
		let seen: ValidationContext | undefined;
		const registry = new ValidatorRegistry().register(
			reporting([RULE_A, RULE_B], (context) => {
				seen = context;
				return [];
			})
		);

		await validateManifest(MANIFEST, config({ rules: { "rule-a": "off" } }), registry);

		expect(seen?.isEnabled("rule-a")).toBe(false);
		expect(seen?.isEnabled("rule-b")).toBe(true);
	});

	it("does not run a validator whose every rule is off", async () => {
		let ran = false;
		const registry = new ValidatorRegistry().register(
			reporting([RULE_A], () => {
				ran = true;
				return [];
			})
		);

		await validateManifest(MANIFEST, config({ rules: { "rule-a": "off" } }), registry);

		expect(ran).toBe(false);
	});

	it("awaits an async validator", async () => {
		const registry = new ValidatorRegistry().register(
			reporting([RULE_A], async () => [
				{ rule: RULE_A.id, message: "async finding", target: { kind: "graph" } },
			])
		);

		const result = await validateManifest(MANIFEST, config(), registry);

		expect(result.diagnostics.map((d) => d.message)).toEqual(["async finding"]);
	});

	it("tallies counts per severity", async () => {
		const registry = new ValidatorRegistry().register(
			reporting([RULE_A, RULE_B], () => [
				{ rule: RULE_A.id, message: "one", target: { kind: "graph" } },
				{ rule: RULE_A.id, message: "two", target: { kind: "graph" } },
				{ rule: RULE_B.id, message: "three", target: { kind: "graph" } },
			])
		);

		const result = await validateManifest(MANIFEST, config(), registry);

		expect(result.counts).toEqual({ error: 2, warn: 1, info: 0 });
	});

	it("reports a throwing validator as a diagnostic and keeps going", async () => {
		const registry = new ValidatorRegistry()
			.register(
				reporting([RULE_A], () => {
					throw new Error("boom");
				})
			)
			.register(reporting([RULE_B]));

		const result = await validateManifest(MANIFEST, config(), registry);

		expect(result.diagnostics.map((d) => d.rule)).toEqual([VALIDATOR_ERROR_RULE.id, "rule-b"]);
		expect(result.diagnostics[0].severity).toBe("error");
		expect(result.diagnostics[0].message).toContain("boom");
		expect(result.diagnostics[0].message).toContain("rule-a");
	});

	it("honours validator-error being configured off", async () => {
		const registry = new ValidatorRegistry().register(
			reporting([RULE_A], () => {
				throw new Error("boom");
			})
		);

		const result = await validateManifest(
			MANIFEST,
			config({ rules: { "validator-error": "off" } }),
			registry
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.rulesSkipped).toEqual([VALIDATOR_ERROR_RULE.id]);
	});

	it("throws when a validator reports a rule it does not declare", async () => {
		const registry = new ValidatorRegistry().register(
			reporting([RULE_A], () => [{ rule: "rule-b", message: "stray", target: { kind: "graph" } }])
		);

		await expect(validateManifest(MANIFEST, config(), registry)).rejects.toThrow(
			/reported rule "rule-b", which it does not declare/
		);
	});

	it("exposes the manifest's nodes by id in the context", async () => {
		let seen: ValidationContext | undefined;
		const registry = new ValidatorRegistry().register(
			reporting([RULE_A], (context) => {
				seen = context;
				return [];
			})
		);

		await validateManifest(MANIFEST, config(), registry);

		expect([...(seen?.nodes.keys() ?? [])]).toEqual(["README.md", "api.yaml"]);
		expect(seen?.nodes.get("api.yaml")?.title).toBe("API");
		expect(seen?.manifest).toBe(MANIFEST);
	});

	it("reports config rule ids that no validator declares", async () => {
		const registry = new ValidatorRegistry().register(reporting([RULE_A]));

		const result = await validateManifest(
			MANIFEST,
			config({ rules: { "rule-a": "warn", "not-a-rule": "off" } }),
			registry
		);

		expect(result.unknownRules).toEqual(["not-a-rule"]);
		expect(result.diagnostics.map((d) => d.severity)).toEqual(["warn"]);
	});

	it("finds nothing with the default registry, which has no checks yet", async () => {
		const result = await validateManifest(MANIFEST, config());

		expect(result.diagnostics).toEqual([]);
		expect(result.counts).toEqual({ error: 0, warn: 0, info: 0 });
	});
});
