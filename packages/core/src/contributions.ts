import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { glob } from "glob";
import { parse } from "yaml";
import type { WeftConfig, WeftEdge, WeftNode } from "./types.js";

/** Contribution file schema version this build understands. */
export const CONTRIBUTION_VERSION = 1;

/**
 * Node types a contribution may declare.
 *
 * `artifact` matters most here: a build knows what it generated and from what,
 * and a generated output is never discoverable by indexing source.
 */
const NODE_TYPES = ["markdown", "openapi", "artifact"];

/**
 * Node fields a contribution may set on a document Weft already indexed.
 *
 * `id`, `type`, `anchors` and `project` are excluded on purpose: the first
 * three are facts about the file Weft read, and the last is graph topology. A
 * build tool contributes what it knows that Weft cannot see, and overriding
 * extraction output is not that.
 */
const PATCHABLE_FIELDS = [
	"title",
	"description",
	"theme",
	"ogImage",
	"hiddenFromNav",
	"contentHash",
	"lineCount",
	// A build tool often knows a version Weft cannot see — one kept in a release
	// file or a tag rather than in the document's own frontmatter.
	"version",
	"modified",
] as const;

/** Field patch applied to a node that already exists in the graph. */
export type NodePatch = Partial<Pick<WeftNode, (typeof PATCHABLE_FIELDS)[number]>>;

/**
 * Facts an external build declares about the graph.
 *
 * Weft indexes source; a renderer knows things source cannot express — what a
 * templated link resolved to, what it generated and from what. One format for
 * all of them, so Weft never needs a per-tool adapter.
 */
export interface Contribution {
	version: number;
	/** Producing tool, echoed in messages so a bad contribution is traceable. */
	tool?: string;
	/** Nodes the build knows about that indexing source cannot discover. */
	nodes?: WeftNode[];
	/** Edges the build knows about. */
	edges?: WeftEdge[];
	/** Field patches for nodes that already exist, keyed by node id. */
	metadata?: Record<string, NodePatch>;
}

/** A parsed contribution and the file it came from, for error messages. */
export interface LoadedContribution {
	contribution: Contribution;
	/** Path relative to the project root. */
	file: string;
}

function fail(file: string, message: string): Error {
	return new Error(`weft contribution: ${message} (in ${file})`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateNode(raw: unknown, file: string, index: number): WeftNode {
	if (!isPlainObject(raw)) throw fail(file, `nodes[${index}] must be a mapping`);
	if (typeof raw.id !== "string" || !raw.id) {
		throw fail(file, `nodes[${index}] is missing "id"`);
	}
	if (!NODE_TYPES.includes(raw.type as string)) {
		throw fail(
			file,
			`nodes[${index}] ("${raw.id}") must have type ${NODE_TYPES.map((t) => `"${t}"`).join(", ")}`
		);
	}
	if (raw.anchors !== undefined && !Array.isArray(raw.anchors)) {
		throw fail(file, `nodes[${index}] ("${raw.id}") has a non-array "anchors"`);
	}

	return {
		...(raw as unknown as WeftNode),
		title: typeof raw.title === "string" ? raw.title : raw.id,
		anchors: (raw.anchors as WeftNode["anchors"]) ?? [],
	};
}

function validateEdge(raw: unknown, file: string, index: number): WeftEdge {
	if (!isPlainObject(raw)) throw fail(file, `edges[${index}] must be a mapping`);

	const endpoint = (key: "from" | "to") => {
		const value = raw[key];
		if (!isPlainObject(value) || typeof value.node !== "string" || !value.node) {
			throw fail(file, `edges[${index}] needs a "${key}.node" string`);
		}
		return value as unknown as WeftEdge["from"];
	};

	const from = endpoint("from");
	const to = endpoint("to");
	if (raw.type !== undefined && typeof raw.type !== "string") {
		throw fail(file, `edges[${index}] has a non-string "type"`);
	}

	return { ...(raw as unknown as WeftEdge), from, to, type: (raw.type as string) ?? "references" };
}

function validatePatch(raw: unknown, file: string, nodeId: string): NodePatch {
	if (!isPlainObject(raw)) throw fail(file, `metadata["${nodeId}"] must be a mapping`);

	for (const key of Object.keys(raw)) {
		if (!(PATCHABLE_FIELDS as readonly string[]).includes(key)) {
			throw fail(
				file,
				`metadata["${nodeId}"] cannot set "${key}" — patchable fields are ${PATCHABLE_FIELDS.join(", ")}`
			);
		}
	}

	return raw as NodePatch;
}

/** Validate one parsed contribution file. */
export function validateContribution(raw: unknown, file: string): Contribution {
	if (!isPlainObject(raw)) throw fail(file, "file must contain a top-level mapping");
	if (raw.version !== CONTRIBUTION_VERSION) {
		throw fail(
			file,
			`"version" must be ${CONTRIBUTION_VERSION}, got ${JSON.stringify(raw.version)}`
		);
	}
	if (raw.tool !== undefined && typeof raw.tool !== "string") {
		throw fail(file, '"tool" must be a string');
	}

	const nodes = raw.nodes ?? [];
	const edges = raw.edges ?? [];
	if (!Array.isArray(nodes)) throw fail(file, '"nodes" must be an array');
	if (!Array.isArray(edges)) throw fail(file, '"edges" must be an array');
	if (raw.metadata !== undefined && !isPlainObject(raw.metadata)) {
		throw fail(file, '"metadata" must be a mapping of node id to fields');
	}

	const metadata: Record<string, NodePatch> = {};
	for (const [nodeId, patch] of Object.entries(raw.metadata ?? {})) {
		metadata[nodeId] = validatePatch(patch, file, nodeId);
	}

	return {
		version: CONTRIBUTION_VERSION,
		...(typeof raw.tool === "string" ? { tool: raw.tool } : {}),
		nodes: nodes.map((node, i) => validateNode(node, file, i)),
		edges: edges.map((edge, i) => validateEdge(edge, file, i)),
		metadata,
	};
}

/**
 * Read every configured contribution file.
 *
 * Paths are globs relative to the project root, resolved in sorted order so a
 * merge is reproducible regardless of how the filesystem enumerates them.
 */
export async function loadContributions(config: WeftConfig): Promise<LoadedContribution[]> {
	if (!config.contributions?.length) return [];

	const files = await glob(config.contributions, {
		cwd: config.rootDir,
		nodir: true,
		posix: true,
	});

	const loaded: LoadedContribution[] = [];
	for (const file of files.sort()) {
		const source = await readFile(resolve(config.rootDir, file), "utf8");
		let raw: unknown;
		try {
			raw = parse(source);
		} catch (err) {
			throw fail(file, `failed to parse: ${(err as Error).message}`);
		}
		loaded.push({ contribution: validateContribution(raw ?? {}, file), file });
	}

	return loaded;
}

/**
 * Merge contributions into a graph.
 *
 * Order is defined and part of the contract: Weft indexes source first, then
 * contributions apply in the order their files sorted. Indexing rendered output
 * instead would lose sidecars and source structure, so the build contributes
 * resolved facts afterwards rather than replacing the scan.
 */
export function applyContributions(
	graph: { nodes: WeftNode[]; edges: WeftEdge[] },
	contributions: LoadedContribution[]
): { nodes: WeftNode[]; edges: WeftEdge[] } {
	if (!contributions.length) return graph;

	const nodes = [...graph.nodes];
	const edges = [...graph.edges];
	const indexOf = new Map(nodes.map((node, i) => [node.id, i]));

	for (const { contribution, file } of contributions) {
		for (const node of contribution.nodes ?? []) {
			const existing = indexOf.get(node.id);
			if (existing === undefined) {
				indexOf.set(node.id, nodes.length);
				nodes.push(node);
				continue;
			}
			// Weft already indexed this path. Usually that means build output is
			// landing under docsDir, which is worth saying out loud.
			console.warn(
				`weft contribution: "${node.id}" is already indexed from source; merging over it (in ${file}). Is build output inside docsDir?`
			);
			nodes[existing] = { ...nodes[existing], ...node };
		}

		for (const [nodeId, patch] of Object.entries(contribution.metadata ?? {})) {
			const existing = indexOf.get(nodeId);
			if (existing === undefined) {
				console.warn(
					`weft contribution: metadata for unknown node "${nodeId}" ignored (in ${file})`
				);
				continue;
			}
			nodes[existing] = { ...nodes[existing], ...patch };
		}

		edges.push(...(contribution.edges ?? []));
	}

	return { nodes, edges };
}
