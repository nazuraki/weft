import { readFileSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { glob } from 'glob';
import { getDocType, extractAnchors, extractTitle } from './anchors/index.js';
import { extractMarkdownLinks } from './links/markdown.js';
import { extractSidecarLinks } from './links/sidecar.js';
import type { WeftConfig, Manifest, WeftNode, WeftEdge } from './types.js';

/** Scan the docs directory and build the graph manifest. */
export async function buildManifest(config: WeftConfig): Promise<Manifest> {
	const docsDir = resolve(config.rootDir, config.docsDir);

	// Find all doc files
	const files = await glob('**/*.{md,markdown,yaml,yml}', {
		cwd: docsDir,
		ignore: config.ignore,
		nodir: true
	});

	// Find all sidecar files
	const sidecarFiles = await glob('**/*.weft', {
		cwd: docsDir,
		ignore: config.ignore,
		nodir: true
	});

	const nodes: WeftNode[] = [];
	const edges: WeftEdge[] = [];

	for (const file of files) {
		const absPath = resolve(docsDir, file);
		const docType = getDocType(file);
		if (!docType) continue;

		const content = readFileSync(absPath, 'utf-8');
		const anchors = extractAnchors(content, docType);
		const title = extractTitle(content, docType) ?? file;

		nodes.push({
			id: file,
			type: docType,
			title,
			anchors
		});

		// Extract links from markdown files
		if (docType === 'markdown') {
			const fileEdges = extractMarkdownLinks(content, absPath, docsDir);
			edges.push(...fileEdges);
		}
	}

	// Extract links from sidecar files
	for (const sidecarFile of sidecarFiles) {
		const absPath = resolve(docsDir, sidecarFile);
		const content = readFileSync(absPath, 'utf-8');
		const sidecarEdges = extractSidecarLinks(content, absPath, docsDir);
		edges.push(...sidecarEdges);
	}

	return { version: 1, nodes, edges };
}
