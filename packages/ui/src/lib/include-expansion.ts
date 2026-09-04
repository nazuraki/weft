import { INCLUDES, type WeftEdge, extractSection } from "@lepid-labs/weft-core/browser";
import type { Element, ElementContent, Root } from "hast";

/**
 * What the renderer needs to expand include edges. Supplied by the component
 * that owns the document — the render pipeline itself stays free of any
 * knowledge of clients or manifests.
 */
export interface IncludeOptions {
	/** Node id of the document being rendered. */
	nodeId: string;
	/** The manifest's edges. The expander selects the `includes` it needs. */
	edges: WeftEdge[];
	/** Fetch a document's raw content by node id. */
	fetchDoc(id: string): Promise<string>;
}

/** IncludeOptions plus the pipeline hook `renderMarkdown` threads in. */
export interface IncludeContext extends IncludeOptions {
	/** Render markdown through the same untrusted stage this tree came from. */
	renderFragment(markdown: string): Promise<Root>;
}

/**
 * How deep expansion nests before degrading to a link.
 *
 * A backstop independent of the visited set, so a long non-cyclic chain cannot
 * make one page fetch and render arbitrarily much of the graph.
 */
export const MAX_INCLUDE_DEPTH = 5;

const HEADING = /^h([1-6])$/;

interface Candidate {
	/** The element to rewrite: a `p` (replaced) or `li` (children replaced). */
	container: Element;
	parent: { children: ElementContent[] };
	index: number;
	link: Element;
	edge: WeftEdge;
	/** Heading level at the point of inclusion; 0 before any heading. */
	inclusionLevel: number;
}

/**
 * Expand the document's include edges in place.
 *
 * Runs at the end of the untrusted stage, so everything it splices in still
 * passes through the sanitizer like the document's own content. Expansion
 * happens where a link the document already carries stands alone as a block —
 * the sole content of a paragraph or list item — and that link is the source
 * of an `includes` edge. A link woven into a sentence is never expanded:
 * inlining a section mid-sentence has no sensible reading.
 *
 * The visited chain guards cycles independently of the `include-cycle` rule,
 * because a manifest that predates the rule (or a hand-fed one) must degrade
 * to a link with a notice rather than hang the page.
 */
export async function expandIncludes(
	tree: Root,
	context: IncludeContext,
	visited: string[] = [context.nodeId]
): Promise<void> {
	const candidates = collectCandidates(tree, context);

	for (const candidate of candidates) {
		const target = candidate.edge.to.node;

		if (visited.includes(target)) {
			degrade(candidate, "include cycle — rendered as a link");
			continue;
		}
		if (visited.length > MAX_INCLUDE_DEPTH) {
			degrade(candidate, "includes nested too deeply — rendered as a link");
			continue;
		}

		let content: string;
		try {
			content = await context.fetchDoc(target);
		} catch {
			degrade(candidate, "include target could not be loaded");
			continue;
		}

		const section = extractSection(content, candidate.edge.to.anchor);
		if (!section) {
			// A broken anchor is edge-anchor-missing's finding; the page only needs
			// to degrade gracefully.
			degrade(candidate, "include anchor not found — rendered as a link");
			continue;
		}

		const fragment = await context.renderFragment(section.text);
		await expandIncludes(fragment, { ...context, nodeId: target }, [...visited, target]);

		if (candidate.edge.headingShift !== "none" && section.baseLevel !== undefined) {
			shiftHeadings(fragment, candidate.inclusionLevel + 1 - section.baseLevel);
		}

		splice(candidate, attributedFrame(candidate, fragment));
	}
}

/**
 * Walk in document order, tracking the heading level each include lands under.
 * Collection is separate from expansion because expansion awaits fetches, and
 * the level must come from position, not from resolution order.
 */
function collectCandidates(tree: Root, context: IncludeContext): Candidate[] {
	const includes = context.edges.filter(
		(edge) => edge.type === INCLUDES && !edge.pending && edge.from.node === context.nodeId
	);
	if (!includes.length) return [];

	const candidates: Candidate[] = [];
	let level = 0;

	const walk = (parent: { children: ElementContent[] } | Root) => {
		parent.children.forEach((child, index) => {
			if (child.type !== "element") return;

			const heading = HEADING.exec(child.tagName);
			if (heading) {
				level = Number(heading[1]);
				return;
			}

			const link = soleBlockLink(child);
			const edge = link && matchEdge(link, includes, context.nodeId);
			if (link && edge) {
				candidates.push({
					container: child,
					parent: parent as { children: ElementContent[] },
					index,
					link,
					edge,
					inclusionLevel: level,
				});
				return;
			}

			walk(child);
		});
	};
	walk(tree);
	return candidates;
}

/** The link standing alone in a `p` or `li`, if this element is one. */
function soleBlockLink(element: Element): Element | undefined {
	if (element.tagName !== "p" && element.tagName !== "li") return undefined;

	const meaningful = element.children.filter(
		(child) => !(child.type === "text" && child.value.trim() === "")
	);
	const [only] = meaningful;
	if (meaningful.length !== 1 || only.type !== "element") return undefined;

	if (only.tagName === "a") return only;
	// A loose list item wraps its content in a paragraph.
	if (element.tagName === "li" && only.tagName === "p") return soleBlockLink(only);
	return undefined;
}

/** The include edge this link declares, if any. */
function matchEdge(link: Element, includes: WeftEdge[], nodeId: string): WeftEdge | undefined {
	const href = link.properties?.href;
	if (typeof href !== "string" || href === "") return undefined;

	const [path, anchor] = href.split("#");
	const slug = anchor ? `#${anchor}` : undefined;
	const resolved = resolveHref(nodeId, path);

	return includes.find(
		(edge) =>
			(edge.to.node === resolved || edge.resolvedFrom === path) &&
			(edge.to.anchor ?? "") === (slug ?? "")
	);
}

/**
 * Resolve a relative href against the current node id's directory, the same
 * arithmetic link extraction did when it made the edge. A path that escapes
 * the docs root resolves to nothing — such a link never became an edge.
 */
export function resolveHref(nodeId: string, href: string): string | undefined {
	if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return undefined;

	const base = nodeId.split("/").slice(0, -1);
	for (const segment of href.split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") {
			if (!base.length) return undefined;
			base.pop();
			continue;
		}
		base.push(segment);
	}
	return base.join("/") || undefined;
}

/** Shift every heading by `delta` levels, clamped to h1–h6. */
function shiftHeadings(tree: Root, delta: number): void {
	if (delta === 0) return;
	const walk = (parent: { children: ElementContent[] } | Root) => {
		for (const child of parent.children) {
			if (child.type !== "element") continue;
			const heading = HEADING.exec(child.tagName);
			if (heading) {
				const level = Math.min(6, Math.max(1, Number(heading[1]) + delta));
				child.tagName = `h${level}`;
			} else walk(child);
		}
	};
	walk(tree);
}

/**
 * The included content inside a visibly attributed frame: a marker linking to
 * the source node, then the content. The marker's href is the link as the
 * author wrote it, so in-app navigation handles it like any other link.
 */
function attributedFrame(candidate: Candidate, fragment: Root): Element {
	const href = String(candidate.link.properties?.href ?? "");
	const label = `${candidate.edge.to.node}${candidate.edge.to.anchor ?? ""}`;

	return {
		type: "element",
		tagName: "aside",
		properties: { className: ["weft-include"] },
		children: [
			{
				type: "element",
				tagName: "div",
				properties: { className: ["weft-include-source"] },
				children: [
					{
						type: "element",
						tagName: "a",
						properties: { href, className: ["weft-include-origin"] },
						children: [{ type: "text", value: label }],
					},
				],
			},
			...(fragment.children.filter((child) => child.type !== "doctype") as ElementContent[]),
		],
	};
}

/** Swap the candidate's block for the frame. */
function splice(candidate: Candidate, frame: Element): void {
	if (candidate.container.tagName === "li") candidate.container.children = [frame];
	else candidate.parent.children[candidate.index] = frame;
}

/** Keep the link, append a notice saying why it was not expanded. */
function degrade(candidate: Candidate, reason: string): void {
	const target = candidate.container;
	target.children = [
		...target.children,
		{
			type: "element",
			tagName: "span",
			properties: { className: ["weft-include-notice"] },
			children: [{ type: "text", value: ` (${reason})` }],
		},
	];
}
