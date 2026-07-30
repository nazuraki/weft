import {
	type Diagnostic,
	type DiagnosticTarget,
	type ValidationResult,
	type ValidatorRegistry,
	WeftService,
	defaultRegistry,
	loadConfig,
} from "@weft/core";

/** Severity order for reporting — worst first. */
const SEVERITY_ORDER = ["error", "warn", "info"] as const;

/** Build the graph for a project and run every registered check over it. */
export async function runValidation(
	rootDir: string,
	registry: ValidatorRegistry = defaultRegistry()
): Promise<ValidationResult> {
	const config = await loadConfig(rootDir);
	return new WeftService(config).validate(registry);
}

/** Render what a diagnostic concerns as a single location string. */
export function formatTarget(target: DiagnosticTarget): string {
	switch (target.kind) {
		case "node":
			return `${target.node}${target.anchor ?? ""}`;
		case "edge": {
			const { from, to } = target.edge;
			return `${from.node}${from.anchor ?? ""} -> ${to.node}${to.anchor ?? ""}`;
		}
		default:
			return "(graph)";
	}
}

/** Pluralize a count for the summary line. */
function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatDiagnostic(diagnostic: Diagnostic): string {
	const head = `  ${diagnostic.severity.padEnd(5)}  ${diagnostic.rule.padEnd(24)}  ${formatTarget(diagnostic.target)}`;
	const message = `          ${diagnostic.message}`;
	const hint = diagnostic.hint ? `\n          hint: ${diagnostic.hint}` : "";
	return `${head}\n${message}${hint}`;
}

/**
 * Render a validation result for the terminal.
 *
 * Output is deliberately ASCII-only: the Windows console is cp1252, where a
 * decorative glyph raises an encoding error on write and crashes the command on
 * its own output.
 */
export function formatReport(result: ValidationResult, options: { json?: boolean } = {}): string {
	if (options.json) return JSON.stringify(result, null, 2);

	const lines: string[] = [];

	for (const severity of SEVERITY_ORDER) {
		for (const diagnostic of result.diagnostics.filter((d) => d.severity === severity)) {
			lines.push(formatDiagnostic(diagnostic));
		}
	}

	if (lines.length) lines.push("");

	const { error, warn, info } = result.counts;
	const total = error + warn + info;
	lines.push(
		total === 0
			? "No problems found."
			: `${plural(total, "problem")} (${plural(error, "error")}, ${plural(warn, "warning")}, ${plural(info, "note")})`
	);

	const ran = plural(result.rulesRun.length, "rule");
	const off = result.rulesSkipped.length ? `, ${result.rulesSkipped.length} off` : "";
	lines.push(`Ran ${ran}${off}.`);

	if (result.unknownRules.length) {
		lines.push(`! config sets a severity for unknown rules: ${result.unknownRules.join(", ")}`);
	}

	return lines.join("\n");
}

/** List every registered rule and its default severity, for discovering config ids. */
export function formatRules(registry: ValidatorRegistry): string {
	const rules = registry.rules;
	if (!rules.length) return "No rules are registered.";

	const width = Math.max(...rules.map((rule) => rule.id.length));
	return rules
		.map(
			(rule) => `${rule.id.padEnd(width)}  ${rule.defaultSeverity.padEnd(5)}  ${rule.description}`
		)
		.join("\n");
}

/** `weft check` fails the build on error severity only. Warnings and notes report but pass. */
export function exitCodeFor(result: ValidationResult): number {
	return result.counts.error > 0 ? 1 : 0;
}
