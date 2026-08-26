import { extractMarkdownAnchors } from "./anchors/markdown.js";
import type {
	IncludeContributes,
	IncludeDefaults,
	IncludeHeadingShift,
	WeftEdge,
} from "./types.js";

/**
 * The edge type that means "this document renders that one inline".
 *
 * A convention rather than a new mechanism, like `DERIVES_FROM` — any string has
 * always been a valid edge type. What it gains here is defined semantics: the
 * renderer expands an edge of this type at render time, and `include-cycle`
 * checks the graph they form stays acyclic.
 */
export const INCLUDES = "includes";

export const HEADING_SHIFTS: readonly IncludeHeadingShift[] = ["auto", "none"];
export const CONTRIBUTES_MODES: readonly IncludeContributes[] = ["source", "inline"];

/**
 * What an include edge means when it says nothing: headings fold into the
 * including document's outline, and content is searchable only at its source.
 */
export const INCLUDE_DEFAULTS: Required<IncludeDefaults> = {
	headingShift: "auto",
	contributes: "source",
};

/**
 * Stamp resolved include semantics onto every `includes` edge.
 *
 * Run at manifest build time so the defaults are resolved exactly once. A
 * consumer of the manifest — the UI most of all, which has no config access —
 * reads the edge and never has to know what the project's defaults were.
 */
export function applyIncludeDefaults(edges: WeftEdge[], defaults?: IncludeDefaults): WeftEdge[] {
	return edges.map((edge) => {
		if (edge.type !== INCLUDES) return edge;
		return {
			...edge,
			headingShift: edge.headingShift ?? defaults?.headingShift ?? INCLUDE_DEFAULTS.headingShift,
			contributes: edge.contributes ?? defaults?.contributes ?? INCLUDE_DEFAULTS.contributes,
		};
	});
}

/** An anchor-bounded slice of a Markdown document. */
export interface SectionRange {
	/** The sliced source text, ready to render. */
	text: string;
	/**
	 * Heading level the range starts at: the selected heading's level, or the
	 * shallowest heading in the document for a whole-document range. Absent when
	 * the document has no headings — there is nothing for `headingShift` to move.
	 */
	baseLevel?: number;
}

/**
 * Extract the section of a Markdown document an anchor selects.
 *
 * The range runs from the anchored heading to the next heading of the same or
 * shallower level, exclusive — the section as a reader understands it. No
 * anchor selects the whole document, the degenerate case of the same idea.
 *
 * Lives in core rather than the UI because a static `weft build` will need the
 * identical slice server-side; the extraction has one home so the two renderers
 * cannot disagree about where a section ends.
 *
 * Returns undefined when the anchor names no heading in the document. That the
 * anchor is broken is `edge-anchor-missing`'s finding — the caller only needs
 * to know there is nothing to expand.
 */
export function extractSection(content: string, anchor?: string): SectionRange | undefined {
	const headings = extractMarkdownAnchors(content).filter((a) => a.level !== undefined);

	if (anchor === undefined || anchor === "" || anchor === "#") {
		const levels = headings.map((h) => h.level as number);
		return {
			text: content,
			...(levels.length ? { baseLevel: Math.min(...levels) } : {}),
		};
	}

	const slug = anchor.startsWith("#") ? anchor : `#${anchor}`;
	const start = headings.find((h) => h.slug === slug);
	if (!start || !start.line) return undefined;

	const level = start.level as number;
	const next = headings.find(
		(h) => (h.line as number) > (start.line as number) && (h.level as number) <= level
	);

	const lines = content.split(/\r?\n/);
	const text = lines.slice(start.line - 1, next?.line ? next.line - 1 : undefined).join("\n");
	return { text, baseLevel: level };
}
