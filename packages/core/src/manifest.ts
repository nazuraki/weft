import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { glob } from "glob";
import { extractAnchors, extractTitle, getDocType } from "./anchors/index.js";
import { extractMarkdownDescription } from "./anchors/markdown.js";
import { parseFrontmatter } from "./frontmatter.js";
import { extractMarkdownLinks } from "./links/markdown.js";
import { extractSidecarLinks } from "./links/sidecar.js";
import type { Manifest, WeftConfig, WeftEdge, WeftNode } from "./types.js";

/** Scan the docs directory and build the graph manifest. */
export async function buildManifest(config: WeftConfig): Promise<Manifest> {
	const docsDir = resolve(config.rootDir, config.docsDir);

	// Find all doc files
	const files = await glob("**/*.{md,markdown,yaml,yml}", {
		cwd: docsDir,
		ignore: config.ignore,
		nodir: true,
	});

	// Find all sidecar files
	const sidecarFiles = await glob("**/*.weft", {
		cwd: docsDir,
		ignore: config.ignore,
		nodir: true,
	});

	let nodes: WeftNode[] = [];
	const edges: WeftEdge[] = [];

	for (const file of files) {
		const absPath = resolve(docsDir, file);
		const docType = getDocType(file);
		if (!docType) continue;

		const raw = readFileSync(absPath, "utf-8");
		const { data: frontmatter, body } =
			docType === "markdown" ? parseFrontmatter(raw) : { data: {}, body: raw };

		const anchors = extractAnchors(body, docType);
		const title = frontmatter.title ?? extractTitle(body, docType) ?? file;

		const description =
			frontmatter.description ??
			(docType === "markdown" ? extractMarkdownDescription(body) : undefined);

		nodes.push({
			id: file,
			type: docType,
			title,
			anchors,
			...(frontmatter.theme ? { theme: frontmatter.theme } : {}),
			...(description ? { description } : {}),
			...(frontmatter.ogImage ? { ogImage: frontmatter.ogImage } : {}),
		});

		// Extract links from markdown files
		if (docType === "markdown") {
			const fileEdges = extractMarkdownLinks(body, absPath, docsDir);
			edges.push(...fileEdges);
		}
	}

	// Extract links from sidecar files
	for (const sidecarFile of sidecarFiles) {
		const absPath = resolve(docsDir, sidecarFile);
		const content = readFileSync(absPath, "utf-8");
		const sidecarEdges = extractSidecarLinks(content, absPath, docsDir);
		edges.push(...sidecarEdges);
	}

	nodes.sort((a, b) => a.id.localeCompare(b.id));

	if (config.docOrder?.length) {
		const docsDirPrefix = config.docsDir.replace(/\/?$/, "/");
		const order = config.docOrder.map((id) =>
			id.startsWith(docsDirPrefix) ? id.slice(docsDirPrefix.length) : id
		);
		if (config.docOrderStrict) {
			const ordered = order
				.map((id) => nodes.find((n) => n.id === id))
				.filter((n): n is WeftNode => n !== undefined);
			nodes = ordered;
		} else {
			nodes.sort((a, b) => {
				const ai = order.indexOf(a.id);
				const bi = order.indexOf(b.id);
				if (ai === -1 && bi === -1) return 0;
				if (ai === -1) return 1;
				if (bi === -1) return -1;
				return ai - bi;
			});
		}
	}

	return { version: 1, nodes, edges };
}
