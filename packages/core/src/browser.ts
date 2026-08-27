/**
 * Browser-safe exports from @weft/core — no Node.js built-ins.
 * Use this entry point in browser/embed builds.
 */
export {
	openApiOperationAnchor,
	openApiSchemaAnchor,
	parseOpenApiSpec,
} from "./anchors/openapi.js";
export { nodeIdToDocPath } from "./node-path.js";
export { INCLUDES, INCLUDE_DEFAULTS, extractSection } from "./includes.js";
export type { SectionRange } from "./includes.js";
export type {
	Anchor,
	Assertions,
	IncludeContributes,
	IncludeDefaults,
	IncludeHeadingShift,
	Manifest,
	ProjectManifest,
	ProjectsIndex,
	WeftNode,
	WeftEdge,
	WeftProject,
	WeftProjectRef,
	LinkRef,
	SearchResult,
	SiteConfig,
	StyleConfig,
	WeftConfig,
} from "./types.js";
