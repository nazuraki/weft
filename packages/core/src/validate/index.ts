export { VALIDATOR_ERROR_RULE, ValidatorRegistry, defaultRegistry } from "./registry.js";
export {
	ARTIFACT_SOURCE_UNRECORDED,
	ARTIFACT_STALE,
	DERIVES_FROM,
	artifactValidator,
} from "./rules/artifacts.js";
export { NODE_DIVERGED, NODE_DUPLICATE, duplicateValidator } from "./rules/duplicates.js";
export { NO_HISTORY, graphHistory } from "./history.js";
export {
	ASSERT_LINE_COUNT_MISMATCH,
	ASSERT_MODIFIED_MISMATCH,
	ASSERT_UNVERIFIABLE,
	ASSERT_VERSION_MISMATCH,
	assertionValidator,
} from "./rules/assertions.js";
export {
	EDGE_ANCHOR_MISSING,
	EDGE_PENDING,
	EDGE_PENDING_RESOLVED,
	EDGE_SOURCE_ANCHOR_MISSING,
	EDGE_TARGET_MISSING,
	edgeResolutionValidator,
} from "./rules/edge-resolution.js";
export { validateManifest } from "./run.js";
export type {
	Diagnostic,
	DiagnosticTarget,
	Finding,
	GraphHistory,
	Rule,
	ValidationContext,
	ValidationResult,
	Validator,
} from "./types.js";
