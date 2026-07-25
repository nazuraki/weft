import { relative, sep } from "node:path";
import { parse } from "yaml";
import { type DocsRoot, nodeIdFor, rootForPath } from "../config.js";
import type { LinkRef, WeftEdge } from "../types.js";

interface SidecarLink {
	anchor?: string;
	target: string;
	type?: string;
	label?: string;
}

interface SidecarFile {
	links?: SidecarLink[];
}

/**
 * Extract graph edges from a .weft sidecar YAML file.
 * The sidecar sits next to a source file: `architecture.md.weft` is the sidecar for `architecture.md`.
 *
 * Targets are relative to the source document's own docs root. In multi-project
 * mode a target may instead be qualified with another project's slug
 * (`beta/api.yaml`) to point across products.
 */
export function extractSidecarLinks(
	content: string,
	sidecarPath: string,
	roots: DocsRoot[]
): WeftEdge[] {
	const data = parse(content) as SidecarFile | null;
	if (!data?.links?.length) return [];

	// Sidecar file name: strip .weft to get the source file
	const sourceFile = sidecarPath.replace(/\.weft$/, "");
	const sourceRoot = rootForPath(roots, sourceFile);
	if (!sourceRoot) return [];

	const fromNode = nodeIdFor(sourceRoot, relative(sourceRoot.absDir, sourceFile));
	const slugs = new Set(roots.map((root) => root.slug).filter(Boolean));

	return data.links.map((link) => {
		const [targetPath, targetAnchor] = link.target.split("#");

		// A target already qualified with a known project slug is used as-is;
		// anything else resolves within the source document's own project.
		const qualified = slugs.has(targetPath.split("/")[0])
			? targetPath
			: nodeIdFor(sourceRoot, targetPath);

		const from: LinkRef = { node: fromNode };
		if (link.anchor) from.anchor = link.anchor;

		const to: LinkRef = { node: qualified };
		if (targetAnchor) to.anchor = `#${targetAnchor}`;

		return {
			from,
			to,
			type: link.type ?? "references",
			label: link.label,
		};
	});
}
