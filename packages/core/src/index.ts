export {
	isNamespaced,
	loadConfig,
	nodeIdFor,
	projectRefs,
	resolveDocsRoots,
	rootForNodeId,
	rootForPath,
	slugify,
} from "./config.js";
export type { DocsRoot } from "./config.js";
export { countLines, hashBytes, hashContent, normalizeContent } from "./content.js";
export {
	CONTRIBUTION_VERSION,
	applyContributions,
	loadContributions,
	validateContribution,
} from "./contributions.js";
export type { Contribution, LoadedContribution, NodePatch } from "./contributions.js";
export { parseFrontmatter } from "./frontmatter.js";
export type { Frontmatter } from "./frontmatter.js";
export { checkFreshness, computeInputsHash } from "./freshness.js";
export { fileHistory, lastCommitDates, parseGitLog } from "./git.js";
export type { FileHistory } from "./git.js";
export { WeftService } from "./service.js";
export {
	MANIFEST_VERSION,
	buildManifest,
	buildRootGraph,
	mergeGraphs,
	splitManifest,
} from "./manifest.js";
export type { RootGraph } from "./manifest.js";
export { nodeIdToDocPath } from "./node-path.js";
export { resolvePublishedLinks } from "./published-links.js";
export { SearchIndex } from "./search.js";
export { extractAnchors, extractTitle, getDocType } from "./anchors/index.js";
export { extractMarkdownLinks } from "./links/markdown.js";
export { extractSidecarLinks } from "./links/sidecar.js";
export {
	openApiOperationAnchor,
	openApiSchemaAnchor,
	parseOpenApiSpec,
} from "./anchors/openapi.js";
export {
	ARTIFACT_SOURCE_UNRECORDED,
	ARTIFACT_STALE,
	ASSERT_LINE_COUNT_MISMATCH,
	ASSERT_MODIFIED_MISMATCH,
	ASSERT_UNVERIFIABLE,
	ASSERT_VERSION_MISMATCH,
	DERIVES_FROM,
	NODE_DIVERGED,
	NODE_DUPLICATE,
	VALIDATOR_ERROR_RULE,
	ValidatorRegistry,
	artifactValidator,
	assertionValidator,
	defaultRegistry,
	duplicateValidator,
	graphHistory,
	validateManifest,
} from "./validate/index.js";
export type {
	Diagnostic,
	DiagnosticTarget,
	Finding,
	GraphHistory,
	Rule,
	ValidationContext,
	ValidationResult,
	Validator,
} from "./validate/index.js";
export type {
	Anchor,
	Assertions,
	WeftConfig,
	WeftNode,
	WeftEdge,
	WeftProject,
	WeftProjectRef,
	Freshness,
	FreshnessStatus,
	LinkRef,
	Manifest,
	ManifestBuild,
	ProjectManifest,
	ProjectsIndex,
	RuleSeverity,
	SearchResult,
	Severity,
	SiteConfig,
} from "./types.js";
