/**
 * The mutable part of a `mountDoc`, in a `.svelte.ts` module so the compiler
 * processes the rune.
 *
 * A plain object would be handed to `mount` once and never looked at again;
 * this proxy is what lets `update()` re-point a mounted reader without tearing
 * it down and rebuilding it.
 */
export function createDocState(initial: { nodeId: string; anchor?: string }) {
	const state = $state({ nodeId: initial.nodeId, anchor: initial.anchor });
	return state;
}

export type DocState = ReturnType<typeof createDocState>;
