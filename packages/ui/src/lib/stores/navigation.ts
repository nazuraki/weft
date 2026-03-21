import { writable, derived } from 'svelte/store';

export interface NavEntry {
	nodeId: string;
	anchor?: string;
	title?: string;
}

const stack = writable<NavEntry[]>([]);

export const navigationStack = {
	subscribe: stack.subscribe,

	push(entry: NavEntry) {
		stack.update((s) => [...s, entry]);
	},

	pop() {
		stack.update((s) => s.slice(0, -1));
	},

	replace(entry: NavEntry) {
		stack.update((s) => {
			if (s.length === 0) return [entry];
			return [...s.slice(0, -1), entry];
		});
	},

	reset(entry: NavEntry) {
		stack.set([entry]);
	}
};

export const currentNode = derived(stack, ($stack) =>
	$stack.length > 0 ? $stack[$stack.length - 1] : null
);

export const breadcrumbs = derived(stack, ($stack) => $stack);

export const canGoBack = derived(stack, ($stack) => $stack.length > 1);
