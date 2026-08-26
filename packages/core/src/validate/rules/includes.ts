import { INCLUDES } from "../../includes.js";
import type { Finding, Rule, Validator } from "../types.js";

export const INCLUDE_CYCLE: Rule = {
	id: "include-cycle",
	description: "Documents include each other in a cycle, so no composed form of them exists",
	// A cycle is not a matter of taste: expanding it terminates nowhere, and the
	// renderer's own guard degrades the page rather than fixing the graph.
	defaultSeverity: "error",
};

/**
 * Report cycles in the `includes` edge graph.
 *
 * Cycles are detected at document granularity even when the edges select anchor
 * ranges: a range that provably excludes the back-reference is possible in
 * principle, but proving it means re-implementing range extraction here and
 * keeping two implementations agreeing forever. Simplicity wins — a document
 * pair that includes each other's disjoint halves is rare enough to restructure.
 *
 * Each cycle is reported once, keyed by its sorted member set, so a cycle of
 * three documents is one finding rather than three. The finding targets the
 * graph: nothing knows which document started it, and naming one would imply
 * the others are innocent.
 *
 * Pending edges are skipped — the target does not exist yet, so nothing can
 * expand through it, and `edge-pending` already reports the marker.
 */
export const includeValidator: Validator = {
	rules: [INCLUDE_CYCLE],

	run({ manifest }) {
		const adjacency = new Map<string, Set<string>>();
		for (const edge of manifest.edges) {
			if (edge.type !== INCLUDES || edge.pending) continue;
			const targets = adjacency.get(edge.from.node) ?? new Set();
			targets.add(edge.to.node);
			adjacency.set(edge.from.node, targets);
		}

		const findings: Finding[] = [];
		for (const cycle of findCycles(adjacency)) {
			const members = [...cycle].sort();
			findings.push({
				rule: INCLUDE_CYCLE.id,
				message: `Include cycle: ${members.join(" → ")} → ${members[0]}`,
				target: { kind: "graph" },
				hint: "Break the cycle by removing one include, or restructure so the shared content lives in a document neither includes.",
				data: { nodes: members },
			});
		}
		return findings;
	},
};

/**
 * Strongly connected components with more than one member, plus self-loops —
 * exactly the node sets whose expansion never terminates. Tarjan, iteratively,
 * so a pathological include chain cannot overflow the call stack.
 */
function findCycles(adjacency: Map<string, Set<string>>): string[][] {
	const index = new Map<string, number>();
	const lowlink = new Map<string, number>();
	const onStack = new Set<string>();
	const stack: string[] = [];
	const cycles: string[][] = [];
	let counter = 0;

	for (const start of adjacency.keys()) {
		if (index.has(start)) continue;

		// Each frame is a node plus an iterator over its unvisited successors.
		const frames: { node: string; successors: Iterator<string> }[] = [];
		const push = (node: string) => {
			index.set(node, counter);
			lowlink.set(node, counter);
			counter++;
			stack.push(node);
			onStack.add(node);
			frames.push({ node, successors: (adjacency.get(node) ?? new Set()).values() });
		};
		push(start);

		while (frames.length) {
			const frame = frames[frames.length - 1];
			const next = frame.successors.next();

			if (!next.done) {
				const target = next.value;
				if (!index.has(target)) push(target);
				else if (onStack.has(target)) {
					const low = Math.min(lowlink.get(frame.node) as number, index.get(target) as number);
					lowlink.set(frame.node, low);
				}
				continue;
			}

			frames.pop();
			const parent = frames[frames.length - 1];
			if (parent) {
				const low = Math.min(lowlink.get(parent.node) as number, lowlink.get(frame.node) as number);
				lowlink.set(parent.node, low);
			}

			if (lowlink.get(frame.node) === index.get(frame.node)) {
				const component: string[] = [];
				let member: string;
				do {
					member = stack.pop() as string;
					onStack.delete(member);
					component.push(member);
				} while (member !== frame.node);

				const selfLoop = component.length === 1 && adjacency.get(frame.node)?.has(frame.node);
				if (component.length > 1 || selfLoop) cycles.push(component);
			}
		}
	}
	return cycles;
}
