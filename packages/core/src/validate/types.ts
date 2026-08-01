import type { Manifest, Severity, WeftConfig, WeftEdge, WeftNode } from "../types.js";

/** What a diagnostic concerns: a document (optionally one anchor in it), an edge, or the graph itself. */
export type DiagnosticTarget =
	| { kind: "node"; node: string; anchor?: string }
	| { kind: "edge"; edge: WeftEdge }
	| { kind: "graph" };

/**
 * A validator's output. Deliberately carries no severity — that is resolved by
 * the runner from the rule's default and the user's config, so the same finding
 * can be an error in one project and a warning in another. A rule that needs two
 * severities (a hard failure and a softer "known pending" variant) declares two
 * rule ids, which also makes each independently configurable.
 */
export interface Finding {
	/** Id of the rule reporting this, which must be one the validator declares. */
	rule: string;
	/** Human-readable description of what is wrong. */
	message: string;
	target: DiagnosticTarget;
	/** Optional suggestion for how to fix it. */
	hint?: string;
	/** Optional rule-specific payload, carried through to JSON output. */
	data?: Record<string, unknown>;
}

/** A finding with its severity resolved. This is what consumers report on. */
export interface Diagnostic extends Finding {
	severity: Severity;
}

/** A single check a validator can report. Declared up front so config and `--list-rules` can see it without running anything. */
export interface Rule {
	/** Stable id used in config and in output, e.g. "edge-target-missing". */
	id: string;
	/** One-line description of what the rule checks. */
	description: string;
	/** Severity used when config does not override it. */
	defaultSeverity: Severity;
}

/**
 * What git knows about the indexed files, keyed by node id rather than by path
 * so a validator never repeats the project-namespacing the runner already did.
 *
 * Empty when no rule needed it, when the project is not a git repository, or
 * when git could not answer. A check reading this must treat empty as "nothing
 * to say" rather than as evidence.
 */
export interface GraphHistory {
	/**
	 * Every blob each node has ever held, following renames. Two nodes whose
	 * sets intersect held identical content at some point.
	 */
	blobs: ReadonlyMap<string, ReadonlySet<string>>;
	/** Node id a path moved to, for ids that are no longer in the graph. */
	renames: ReadonlyMap<string, string>;
}

/** Everything a validator gets to work with. Read-only — validation never mutates the graph. */
export interface ValidationContext {
	manifest: Manifest;
	config: WeftConfig;
	/** Nodes by id, prebuilt so every validator does not rescan the node list. */
	nodes: ReadonlyMap<string, WeftNode>;
	/**
	 * What git knows about these files. Gathered once by the runner, and only
	 * when a rule that declared a need for it is enabled — a project running
	 * without the history-based checks pays for no subprocess.
	 */
	history: GraphHistory;
	/** False when the rule is configured "off". Lets an expensive validator skip work it would only throw away. */
	isEnabled(ruleId: string): boolean;
}

/** A registered check. `rules` declares every rule id `run` may emit. */
export interface Validator {
	rules: Rule[];
	/**
	 * True when the check reads `context.history`. Declared rather than inferred
	 * so the runner can skip the git walk entirely when nothing enabled wants it.
	 */
	needsHistory?: boolean;
	run(context: ValidationContext): Finding[] | Promise<Finding[]>;
}

export interface ValidationResult {
	diagnostics: Diagnostic[];
	/** How many diagnostics of each severity. `counts.error` drives the `weft check` exit code. */
	counts: Record<Severity, number>;
	/** Rule ids that ran. */
	rulesRun: string[];
	/** Rule ids skipped because config set them to "off". */
	rulesSkipped: string[];
	/**
	 * Rule ids named in config that no validator declares. Reported rather than
	 * rejected: a config written against a newer Weft, or against a check that is
	 * installed elsewhere, should not stop the run.
	 */
	unknownRules: string[];
}
