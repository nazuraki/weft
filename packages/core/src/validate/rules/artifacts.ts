import type { Finding, Rule, Validator } from "../types.js";

export const ARTIFACT_STALE: Rule = {
	id: "artifact-stale",
	description: "A generated output no longer reflects the source it was built from",
	// The artifact is usually the copy that reaches the reader who matters most,
	// and the one nobody looks at again after building it.
	defaultSeverity: "error",
};

export const ARTIFACT_SOURCE_UNRECORDED: Rule = {
	id: "artifact-source-unrecorded",
	description: "A derives-from edge records no source hash, so staleness cannot be checked",
	// Info rather than warn: `derives-from` is also a reasonable way to express a
	// relationship without asking for it to be checked, and warning on every such
	// edge would punish plain modelling.
	defaultSeverity: "info",
};

/**
 * The edge type that means "this was generated from that".
 *
 * A convention rather than a new mechanism — any string has always been a valid
 * edge type. What it gains here is defined semantics: an edge of this type is
 * the thing staleness is checked over.
 */
export const DERIVES_FROM = "derives-from";

/**
 * Report generated outputs that have fallen behind their sources.
 *
 * The comparison is against the source hash recorded when the artifact was
 * built, never against a modification time. Git preserves no mtimes, so a fresh
 * clone or a CI checkout makes every file look simultaneously modified — the
 * check would be meaningless in exactly the environment it should run in.
 *
 * An artifact with several sources has several `derives-from` edges and each is
 * checked on its own, because a stylesheet or a template change invalidates an
 * output just as surely as an edit to its document does.
 */
export const artifactValidator: Validator = {
	rules: [ARTIFACT_STALE, ARTIFACT_SOURCE_UNRECORDED],

	run({ manifest, nodes }) {
		const findings: Finding[] = [];

		for (const edge of manifest.edges) {
			if (edge.type !== DERIVES_FROM || edge.pending) continue;

			const source = nodes.get(edge.to.node);
			// Whether the source exists at all is edge-resolution's finding.
			if (!source) continue;

			if (!edge.sourceHash) {
				findings.push({
					rule: ARTIFACT_SOURCE_UNRECORDED.id,
					message: `No source hash recorded for ${edge.from.node}, so it cannot be told from ${edge.to.node}`,
					target: { kind: "edge", edge },
					hint: "Have whatever generates it record the source's contentHash as `sourceHash` on the edge.",
					data: { artifact: edge.from.node, source: edge.to.node },
				});
				continue;
			}

			// A source Weft never read has no hash to compare against — a node an
			// external tool declared without one, most likely.
			if (!source.contentHash) {
				findings.push({
					rule: ARTIFACT_SOURCE_UNRECORDED.id,
					message: `${edge.to.node} has no content hash, so ${edge.from.node} cannot be checked against it`,
					target: { kind: "edge", edge },
					hint: "Only a document Weft read from disk has one; a node an external tool declared may not.",
					data: { artifact: edge.from.node, source: edge.to.node },
				});
				continue;
			}

			if (source.contentHash === edge.sourceHash) continue;

			findings.push({
				rule: ARTIFACT_STALE.id,
				message: `${edge.from.node} was generated from an older ${edge.to.node}`,
				target: { kind: "edge", edge },
				hint: `Regenerate ${edge.from.node}, or record the current hash if it is already up to date.`,
				data: {
					artifact: edge.from.node,
					source: edge.to.node,
					generatedFrom: edge.sourceHash,
					current: source.contentHash,
				},
			});
		}

		return findings;
	},
};
