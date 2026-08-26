import type { Manifest, RuleSeverity, Severity, WeftConfig, WeftNode } from "../types.js";
import { NO_HISTORY, graphHistory } from "./history.js";
import { VALIDATOR_ERROR_RULE, type ValidatorRegistry, defaultRegistry } from "./registry.js";
import type {
	Diagnostic,
	Finding,
	GraphHistory,
	Rule,
	ValidationContext,
	ValidationResult,
} from "./types.js";

/** Resolve a rule's severity: the user's config wins over the rule's own default. */
function severityFor(rule: Rule, config: WeftConfig): RuleSeverity {
	return config.rules?.[rule.id] ?? rule.defaultSeverity;
}

/**
 * Whether running this registry under this config will read git history.
 *
 * Exported so a caller that builds the graph itself — the service — can pay
 * for one full history walk up front and hand the result to both the indexer
 * and {@link validateManifest}, instead of each walking on its own.
 */
export function registryWantsHistory(registry: ValidatorRegistry, config: WeftConfig): boolean {
	return registry.validators.some(
		(validator) =>
			validator.needsHistory && validator.rules.some((rule) => severityFor(rule, config) !== "off")
	);
}

/**
 * Run every registered check over a built manifest.
 *
 * Validation is a separate stage from extraction on purpose: it reads the
 * finished graph and never mutates it, so a check can be added without touching
 * the indexer.
 */
export async function validateManifest(
	manifest: Manifest,
	config: WeftConfig,
	registry: ValidatorRegistry = defaultRegistry(),
	precomputedHistory?: GraphHistory
): Promise<ValidationResult> {
	const nodes = new Map<string, WeftNode>(manifest.nodes.map((node) => [node.id, node]));
	const enabled = new Map<string, Severity>();
	const rulesRun: string[] = [];
	const rulesSkipped: string[] = [];

	for (const rule of registry.rules) {
		const severity = severityFor(rule, config);
		if (severity === "off") {
			rulesSkipped.push(rule.id);
			continue;
		}
		enabled.set(rule.id, severity);
		rulesRun.push(rule.id);
	}

	const unknownRules = Object.keys(config.rules ?? {}).filter((id) => !registry.rule(id));

	// Gathered once for every check that wants it, and skipped outright when
	// none is enabled — reading git history is the only IO validation does.
	// A caller who already walked history passes it in instead.
	const wantsHistory = registryWantsHistory(registry, config);
	const history = wantsHistory ? (precomputedHistory ?? (await graphHistory(config))) : NO_HISTORY;

	const context: ValidationContext = {
		manifest,
		config,
		nodes,
		history,
		isEnabled: (ruleId) => enabled.has(ruleId),
	};

	const diagnostics: Diagnostic[] = [];
	// A rule turned off still reaches here if a validator ran for its other
	// rules, so drop findings whose rule is not enabled.
	const record = (finding: Finding) => {
		const severity = enabled.get(finding.rule);
		if (severity) diagnostics.push({ ...finding, severity });
	};

	for (const validator of registry.validators) {
		// Skip a validator whose every rule is off rather than running work it
		// would only throw away.
		if (!validator.rules.some((rule) => enabled.has(rule.id))) continue;

		let findings: Finding[];
		try {
			findings = await validator.run(context);
		} catch (err) {
			// One bad validator must not take down the run — report it as a
			// diagnostic and let the remaining checks finish.
			record({
				rule: VALIDATOR_ERROR_RULE.id,
				message: `Validator for ${validator.rules.map((rule) => rule.id).join(", ")} threw: ${(err as Error).message}`,
				target: { kind: "graph" },
			});
			continue;
		}

		for (const finding of findings) {
			if (!validator.rules.some((rule) => rule.id === finding.rule)) {
				throw new Error(
					`weft validate: a validator reported rule "${finding.rule}", which it does not declare`
				);
			}
			record(finding);
		}
	}

	const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 };
	for (const diagnostic of diagnostics) counts[diagnostic.severity]++;

	return { diagnostics, counts, rulesRun, rulesSkipped, unknownRules };
}
