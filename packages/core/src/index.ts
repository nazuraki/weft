export { defineConfig, loadConfig } from './config.js';
export { WeftService } from './service.js';
export { buildManifest } from './manifest.js';
export { SearchIndex } from './search.js';
export { extractAnchors, extractTitle, getDocType } from './anchors/index.js';
export { extractMarkdownLinks } from './links/markdown.js';
export { extractSidecarLinks } from './links/sidecar.js';
export { parseOpenApiSpec } from './anchors/openapi.js';
export type {
	WeftConfig,
	WeftNode,
	WeftEdge,
	LinkRef,
	Manifest,
	SearchResult
} from './types.js';
