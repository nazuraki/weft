import { relative, sep } from "node:path";
import { parse } from "yaml";
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
 */
export function extractSidecarLinks(
	content: string,
	sidecarPath: string,
	docsDir: string
): WeftEdge[] {
	const data = parse(content) as SidecarFile | null;
	if (!data?.links?.length) return [];

	// Sidecar file name: strip .weft to get the source file
	const sourceFile = sidecarPath.replace(/\.weft$/, "");
	// Node ids are always POSIX-separated; relative() returns native separators.
	const fromNode = relative(docsDir, sourceFile).split(sep).join("/");

	return data.links.map((link) => {
		const [targetPath, targetAnchor] = link.target.split("#");

		const from: LinkRef = { node: fromNode };
		if (link.anchor) from.anchor = link.anchor;

		const to: LinkRef = { node: targetPath };
		if (targetAnchor) to.anchor = `#${targetAnchor}`;

		return {
			from,
			to,
			type: link.type ?? "references",
			label: link.label,
		};
	});
}
