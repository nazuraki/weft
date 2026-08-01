import type { WeftEdge, WeftNode } from "../../types.js";
import type { Finding, Rule, Validator } from "../types.js";

export const ASSERT_VERSION_MISMATCH: Rule = {
	id: "assert-version-mismatch",
	description: "A link asserts a version its target no longer declares",
	// The expensive one: a stale version pointer reads as current, and nothing
	// about the document looks wrong to the reader acting on it.
	defaultSeverity: "error",
};

export const ASSERT_LINE_COUNT_MISMATCH: Rule = {
	id: "assert-line-count-mismatch",
	description: "A link asserts a line count its target no longer has",
	// A length claim drifts with every ordinary edit, so it warns rather than
	// failing a build that is otherwise correct.
	defaultSeverity: "warn",
};

export const ASSERT_MODIFIED_MISMATCH: Rule = {
	id: "assert-modified-mismatch",
	description: "A link asserts a modification date its target no longer matches",
	defaultSeverity: "warn",
};

export const ASSERT_UNVERIFIABLE: Rule = {
	id: "assert-unverifiable",
	description: "A link asserts something that cannot be checked against its target",
	// Not a mismatch — nothing is known to be wrong. But an assertion nobody can
	// check is a check the author believes they have and does not.
	defaultSeverity: "warn",
};

/** Properties a link may assert, for the message when it names something else. */
const ASSERTABLE = ["version", "lineCount", "modified"];

/** How far a `~N` line count may be off, as a fraction of the asserted value. */
const APPROX_TOLERANCE = 0.1;

/** A parsed `lineCount` assertion. */
interface LineCountClaim {
	value: number;
	/** Written `~N`, so nearby counts satisfy it. */
	approximate: boolean;
}

function parseLineCount(asserted: unknown): LineCountClaim | undefined {
	if (typeof asserted === "number") {
		return Number.isInteger(asserted) && asserted >= 0
			? { value: asserted, approximate: false }
			: undefined;
	}
	if (typeof asserted !== "string") return undefined;

	const match = asserted.trim().match(/^(~?)\s*(\d+)$/);
	return match ? { value: Number(match[2]), approximate: match[1] === "~" } : undefined;
}

function unverifiable(
	edge: WeftEdge,
	property: string,
	asserted: unknown,
	reason: string,
	hint: string
): Finding {
	return {
		rule: ASSERT_UNVERIFIABLE.id,
		message: `Cannot check the asserted ${property}: ${reason}`,
		target: { kind: "edge", edge },
		hint,
		data: { property, asserted },
	};
}

function mismatch(
	rule: Rule,
	edge: WeftEdge,
	property: string,
	message: string,
	hint: string,
	asserted: unknown,
	actual: unknown
): Finding {
	return {
		rule: rule.id,
		message,
		target: { kind: "edge", edge },
		hint,
		data: { property, asserted, actual },
	};
}

function checkVersion(edge: WeftEdge, target: WeftNode, asserted: unknown): Finding | undefined {
	const claimed = String(asserted);

	if (target.version === undefined) {
		return unverifiable(
			edge,
			"version",
			claimed,
			`${target.id} declares no version`,
			"Add `version:` to the target's frontmatter, or drop the assertion."
		);
	}
	if (target.version === claimed) return undefined;

	return mismatch(
		ASSERT_VERSION_MISMATCH,
		edge,
		"version",
		`${target.id} is version ${target.version}, not ${claimed}`,
		`Update the assertion to ${target.version}, and check whether the surrounding prose cites the old version too.`,
		claimed,
		target.version
	);
}

function checkLineCount(edge: WeftEdge, target: WeftNode, asserted: unknown): Finding | undefined {
	const claim = parseLineCount(asserted);
	if (!claim) {
		return unverifiable(
			edge,
			"lineCount",
			asserted,
			`${JSON.stringify(asserted)} is not a line count`,
			'Write a whole number, or "~3500" to allow ten percent either way.'
		);
	}

	const actual = target.lineCount;
	if (actual === undefined) {
		return unverifiable(
			edge,
			"lineCount",
			asserted,
			`${target.id} has no line count`,
			"Only a document Weft read from disk has one; a node an external tool declared may not."
		);
	}

	const satisfied = claim.approximate
		? Math.abs(actual - claim.value) <= claim.value * APPROX_TOLERANCE
		: actual === claim.value;
	if (satisfied) return undefined;

	return mismatch(
		ASSERT_LINE_COUNT_MISMATCH,
		edge,
		"lineCount",
		`${target.id} has ${actual} lines, not ${claim.approximate ? `~${claim.value}` : claim.value}`,
		`Update the assertion to ${actual}${claim.approximate ? `, or widen it to ~${actual}` : ""}.`,
		asserted,
		actual
	);
}

function checkModified(edge: WeftEdge, target: WeftNode, asserted: unknown): Finding | undefined {
	const claimed = String(asserted);

	if (!target.modified) {
		return unverifiable(
			edge,
			"modified",
			claimed,
			`${target.id} has no modification date`,
			"Dates come from git history, so the file has to be committed and the project a repository."
		);
	}
	// A prefix, so "2026-07" asserts the month and a full timestamp asserts the
	// instant. The alternative — parsing both sides into dates — would make
	// "2026-07" mean midnight on the first, which is not what it says.
	if (target.modified.startsWith(claimed)) return undefined;

	const actual = target.modified.slice(0, 10);
	return mismatch(
		ASSERT_MODIFIED_MISMATCH,
		edge,
		"modified",
		`${target.id} last changed ${actual}, which does not match ${claimed}`,
		`Update the assertion to ${actual}, or to a prefix of it.`,
		claimed,
		target.modified
	);
}

/**
 * Check the claims links make about the documents they point at.
 *
 * A version cited across several documents is the most expensive thing in a
 * documentation set to maintain by hand, because nothing signals when one goes
 * stale: the claim was true when written, the prose still reads as current, and
 * the discovery is accidental. This turns that into a build failure.
 *
 * Only assertions are checked here. Whether the link resolves at all belongs to
 * the edge-resolution rules, so an edge whose target is missing or still pending
 * is left to them rather than reported twice.
 */
export const assertionValidator: Validator = {
	rules: [
		ASSERT_VERSION_MISMATCH,
		ASSERT_LINE_COUNT_MISMATCH,
		ASSERT_MODIFIED_MISMATCH,
		ASSERT_UNVERIFIABLE,
	],

	run({ manifest, nodes }) {
		const findings: Finding[] = [];

		for (const edge of manifest.edges) {
			if (!edge.asserts || edge.pending) continue;

			const target = nodes.get(edge.to.node);
			if (!target) continue;

			for (const [property, asserted] of Object.entries(edge.asserts)) {
				if (asserted === undefined || asserted === null) continue;

				let finding: Finding | undefined;
				switch (property) {
					case "version":
						finding = checkVersion(edge, target, asserted);
						break;
					case "lineCount":
						finding = checkLineCount(edge, target, asserted);
						break;
					case "modified":
						finding = checkModified(edge, target, asserted);
						break;
					default:
						finding = unverifiable(
							edge,
							property,
							asserted,
							`no node property is called ${property}`,
							`Assertable properties are ${ASSERTABLE.join(", ")}.`
						);
				}

				if (finding) findings.push(finding);
			}
		}

		return findings;
	},
};
