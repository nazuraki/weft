import { describe, expect, it } from "vitest";
import { VALIDATOR_ERROR_RULE, ValidatorRegistry, defaultRegistry } from "../registry.js";
import type { Rule, Validator } from "../types.js";

function stubValidator(rules: Rule[]): Validator {
	return { rules, run: () => [] };
}

const RULE_A: Rule = { id: "rule-a", description: "Checks a", defaultSeverity: "error" };
const RULE_B: Rule = { id: "rule-b", description: "Checks b", defaultSeverity: "warn" };

describe("ValidatorRegistry", () => {
	it("exposes registered validators in registration order", () => {
		const first = stubValidator([RULE_A]);
		const second = stubValidator([RULE_B]);
		const registry = new ValidatorRegistry().register(first).register(second);

		expect(registry.validators).toEqual([first, second]);
	});

	it("exposes every declared rule alongside the reserved ones", () => {
		const registry = new ValidatorRegistry().register(stubValidator([RULE_A, RULE_B]));

		expect(registry.rules.map((rule) => rule.id)).toEqual([
			VALIDATOR_ERROR_RULE.id,
			"rule-a",
			"rule-b",
		]);
	});

	it("looks up a rule by id", () => {
		const registry = new ValidatorRegistry().register(stubValidator([RULE_A]));

		expect(registry.rule("rule-a")).toEqual(RULE_A);
		expect(registry.rule("nope")).toBeUndefined();
	});

	it("rejects a duplicate rule id", () => {
		const registry = new ValidatorRegistry().register(stubValidator([RULE_A]));

		expect(() => registry.register(stubValidator([RULE_A]))).toThrow(/duplicate rule id "rule-a"/);
	});

	it("rejects a rule id that collides with a reserved one", () => {
		const registry = new ValidatorRegistry();

		expect(() =>
			registry.register(
				stubValidator([{ id: VALIDATOR_ERROR_RULE.id, description: "", defaultSeverity: "warn" }])
			)
		).toThrow(/duplicate rule id "validator-error"/);
	});

	it("rejects a validator that declares no rules", () => {
		expect(() => new ValidatorRegistry().register(stubValidator([]))).toThrow(/at least one rule/);
	});

	it("does not leak a failed registration's rules", () => {
		const registry = new ValidatorRegistry().register(stubValidator([RULE_A]));

		expect(() => registry.register(stubValidator([RULE_B, RULE_A]))).toThrow();
		expect(registry.validators).toHaveLength(1);
		expect(registry.rule("rule-b")).toBeUndefined();
	});

	it("rejects a validator that declares the same rule id twice", () => {
		expect(() => new ValidatorRegistry().register(stubValidator([RULE_A, RULE_A]))).toThrow(
			/duplicate rule id "rule-a"/
		);
	});
});

describe("defaultRegistry", () => {
	it("registers no checks yet — this stage is the seam they are built against", () => {
		expect(defaultRegistry().validators).toEqual([]);
	});

	it("still knows the reserved runner rule", () => {
		expect(defaultRegistry().rule(VALIDATOR_ERROR_RULE.id)).toEqual(VALIDATOR_ERROR_RULE);
	});

	it("returns a fresh registry each call", () => {
		const registry = defaultRegistry();
		registry.register(stubValidator([RULE_A]));

		expect(defaultRegistry().rule("rule-a")).toBeUndefined();
	});
});
