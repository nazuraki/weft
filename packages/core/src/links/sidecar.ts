import { relative, sep } from "node:path";
import { type Document, isMap, isSeq, parseDocument } from "yaml";
import { type DocsRoot, nodeIdFor, rootForPath } from "../config.js";
import { CONTRIBUTES_MODES, HEADING_SHIFTS } from "../includes.js";
import { scalarText } from "../scalar-source.js";
import type {
	Assertions,
	IncludeContributes,
	IncludeHeadingShift,
	LinkRef,
	WeftEdge,
} from "../types.js";

interface SidecarLink {
	anchor?: string;
	target: string;
	type?: string;
	label?: string;
	pending?: boolean;
	asserts?: Assertions;
	sourceHash?: string;
	headingShift?: IncludeHeadingShift;
	contributes?: IncludeContributes;
}

interface SidecarFile {
	links?: SidecarLink[];
}

/**
 * True when a link declared a non-empty assertion mapping.
 *
 * What was asserted is not checked here: extraction records the claim, and the
 * validation stage is where a malformed or uncheckable one gets reported, with
 * a rule id and a severity a project can configure.
 */
function hasAssertions(value: unknown): value is Assertions {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.keys(value).length > 0
	);
}

/**
 * The recorded source hash of one link, read as written.
 *
 * Straight off the parsed object this would be a number whenever the hash's
 * sixteen hex characters all happen to be digits — leading zeros gone, and the
 * value silently no longer matching anything. Rare, and exactly the kind of
 * intermittent failure nobody would think to look for.
 */
function sourceHashOf(doc: Document, index: number): string | undefined {
	const links = doc.get("links", true);
	if (!isSeq(links)) return undefined;

	const link = links.get(index, true);
	return isMap(link) ? scalarText(link.get("sourceHash", true)) : undefined;
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
	const doc = parseDocument(content);
	const data = doc.toJS() as SidecarFile | null;
	if (!data?.links?.length) return [];

	// Sidecar file name: strip .weft to get the source file
	const sourceFile = sidecarPath.replace(/\.weft$/, "");
	const sourceRoot = rootForPath(roots, sourceFile);
	if (!sourceRoot) return [];

	const fromNode = nodeIdFor(sourceRoot, relative(sourceRoot.absDir, sourceFile));
	const slugs = new Set(roots.map((root) => root.slug).filter(Boolean));

	return data.links.map((link, index) => {
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

		const sourceHash = sourceHashOf(doc, index);

		return {
			from,
			to,
			type: link.type ?? "references",
			label: link.label,
			...(link.pending === true ? { pending: true } : {}),
			...(hasAssertions(link.asserts) ? { asserts: link.asserts } : {}),
			...(sourceHash ? { sourceHash } : {}),
			// Only a recognised value is recorded, matching how `pending` accepts
			// only `true` — a typo falls back to the configured default rather than
			// travelling into the manifest as an unknown mode.
			...(HEADING_SHIFTS.includes(link.headingShift as IncludeHeadingShift)
				? { headingShift: link.headingShift }
				: {}),
			...(CONTRIBUTES_MODES.includes(link.contributes as IncludeContributes)
				? { contributes: link.contributes }
				: {}),
		};
	});
}
