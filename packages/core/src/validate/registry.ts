import { artifactValidator } from "./rules/artifacts.js";
import { assertionValidator } from "./rules/assertions.js";
import { duplicateValidator } from "./rules/duplicates.js";
import { edgeResolutionValidator } from "./rules/edge-resolution.js";
import type { Rule, Validator } from "./types.js";

/**
 * Reported when a validator throws. Owned by the runner rather than any
 * validator, so it is always present and always configurable — a project that
 * knowingly runs a flaky third-party check can set it to "warn".
 */
export const VALIDATOR_ERROR_RULE: Rule = {
	id: "validator-error",
	description: "A validator threw while running",
	defaultSeverity: "error",
};

/** Rules the runner itself emits. Always registered, cannot be redeclared. */
const RESERVED_RULES: Rule[] = [VALIDATOR_ERROR_RULE];

/**
 * The set of checks a validation run executes. Checks are registered rather
 * than hardcoded so they can be added by later features and by external tools
 * without editing the runner.
 */
export class ValidatorRegistry {
	private readonly registered: Validator[] = [];
	private readonly byRuleId = new Map<string, Rule>(RESERVED_RULES.map((rule) => [rule.id, rule]));

	/** Register a validator. Throws if it declares no rules, or a rule id already taken. */
	register(validator: Validator): this {
		if (!validator.rules.length) {
			throw new Error("weft validate: a validator must declare at least one rule");
		}
		// Check every id before committing any, so a rejected validator leaves no
		// half-registered rules behind.
		const incoming = new Set<string>();
		for (const rule of validator.rules) {
			if (this.byRuleId.has(rule.id) || incoming.has(rule.id)) {
				throw new Error(`weft validate: duplicate rule id "${rule.id}"`);
			}
			incoming.add(rule.id);
		}
		for (const rule of validator.rules) this.byRuleId.set(rule.id, rule);
		this.registered.push(validator);
		return this;
	}

	/** Every registered validator, in registration order. */
	get validators(): Validator[] {
		return [...this.registered];
	}

	/** Every known rule, including the reserved ones the runner emits. */
	get rules(): Rule[] {
		return [...this.byRuleId.values()];
	}

	/** Look up a rule by id, or undefined if no validator declares it. */
	rule(id: string): Rule | undefined {
		return this.byRuleId.get(id);
	}
}

/** A fresh registry holding the built-in checks. */
export function defaultRegistry(): ValidatorRegistry {
	return new ValidatorRegistry()
		.register(edgeResolutionValidator)
		.register(assertionValidator)
		.register(artifactValidator)
		.register(duplicateValidator);
}
