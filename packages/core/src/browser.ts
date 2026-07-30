/**
 * Browser-safe exports from @weft/core — no Node.js built-ins.
 * Use this entry point in browser/embed builds.
 */
export { parseOpenApiSpec } from "./anchors/openapi.js";
export { nodeIdToDocPath } from "./node-path.js";
export type {
	Anchor,
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
	WeftConfig,
} from "./types.js";
