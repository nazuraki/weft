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
export { countLines, hashContent, normalizeContent } from "./content.js";
export {
	CONTRIBUTION_VERSION,
	applyContributions,
	loadContributions,
	validateContribution,
} from "./contributions.js";
export type { Contribution, LoadedContribution, NodePatch } from "./contributions.js";
export { parseFrontmatter } from "./frontmatter.js";
export type { Frontmatter } from "./frontmatter.js";
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
	VALIDATOR_ERROR_RULE,
	ValidatorRegistry,
	defaultRegistry,
	validateManifest,
} from "./validate/index.js";
export type {
	Diagnostic,
	DiagnosticTarget,
	Finding,
	Rule,
	ValidationContext,
	ValidationResult,
	Validator,
} from "./validate/index.js";
export type {
	Anchor,
	WeftConfig,
	WeftNode,
	WeftEdge,
	WeftProject,
	WeftProjectRef,
	LinkRef,
	Manifest,
	ProjectManifest,
	ProjectsIndex,
	RuleSeverity,
	SearchResult,
	Severity,
	SiteConfig,
} from "./types.js";
