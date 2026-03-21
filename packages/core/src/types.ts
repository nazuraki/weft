export interface WeftConfig {
	rootDir: string;
	docsDir: string;
	entryPoint: string;
	ignore: string[];
}

export interface WeftNode {
	id: string;
	type: 'markdown' | 'openapi';
	title: string;
	anchors: string[];
}

export interface LinkRef {
	node: string;
	anchor?: string;
}

export interface WeftEdge {
	from: LinkRef;
	to: LinkRef;
	type: string;
	label?: string;
}

export interface Manifest {
	version: number;
	nodes: WeftNode[];
	edges: WeftEdge[];
}

export interface SearchResult {
	id: string;
	title: string;
	anchor?: string;
	score: number;
	match: Record<string, string[]>;
}
