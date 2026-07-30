export { VALIDATOR_ERROR_RULE, ValidatorRegistry, defaultRegistry } from "./registry.js";
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
	Rule,
	ValidationContext,
	ValidationResult,
	Validator,
} from "./types.js";
