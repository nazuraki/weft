/**
 * Browser-safe exports from @weft/core — no Node.js built-ins.
 * Use this entry point in browser/embed builds.
 */
export { parseOpenApiSpec } from "./anchors/openapi.js";
export type { Manifest, WeftNode, WeftEdge, LinkRef, SearchResult, WeftConfig } from "./types.js";
