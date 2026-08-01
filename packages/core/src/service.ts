import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import chokidar from "chokidar";
import { getDocType } from "./anchors/index.js";
import { type DocsRoot, isNamespaced, resolveDocsRoots, rootForNodeId } from "./config.js";
import { loadContributions } from "./contributions.js";
import { type RootGraph, buildRootGraph, mergeGraphs, splitManifest } from "./manifest.js";
import { SearchIndex } from "./search.js";
import type { Manifest, ProjectsIndex, SearchResult, WeftConfig, WeftEdge } from "./types.js";
import {
	type ValidationResult,
	type ValidatorRegistry,
	defaultRegistry,
	validateManifest,
} from "./validate/index.js";

export class WeftService {
	private config: WeftConfig;
	private roots: DocsRoot[];
	private graphs = new Map<string, RootGraph>();
	private manifest: Manifest | null = null;
	private searchIndex: SearchIndex;

	constructor(config: WeftConfig) {
		this.config = config;
		this.roots = resolveDocsRoots(config);
		this.searchIndex = new SearchIndex();
	}

	get weftConfig(): WeftConfig {
		return this.config;
	}

	/** All configured docs roots — one per project, or a single implicit root. */
	get docsRoots(): DocsRoot[] {
		return this.roots;
	}

	/** True when node ids are namespaced by project slug. */
	get namespaced(): boolean {
		return isNamespaced(this.roots);
	}

	/** Get the docs directory absolute path. In multi-project mode, the first project's. */
	get docsDir(): string {
		return this.roots[0].absDir;
	}

	/** Path of the merged manifest. */
	get manifestPath(): string {
		return this.namespaced
			? resolve(this.config.rootDir, ".weft", "manifest.json")
			: resolve(this.docsDir, ".weft", "manifest.json");
	}

	/** Path of a single project's manifest. */
	projectManifestPath(slug: string): string {
		const root = this.roots.find((r) => r.slug === slug);
		if (!root) throw new Error(`Unknown project: ${slug}`);
		return resolve(root.absDir, ".weft", "manifest.json");
	}

	/** Path of the index listing every project manifest. */
	get projectsIndexPath(): string {
		return resolve(this.config.rootDir, ".weft", "projects.json");
	}

	/** Resolve a node id to an absolute file path, or undefined if it escapes its root. */
	resolveNodePath(nodeId: string): string | undefined {
		const match = rootForNodeId(this.roots, nodeId);
		if (!match) return undefined;

		const filePath = resolve(match.root.absDir, match.relPath);
		const rel = relative(match.root.absDir, filePath);
		if (rel.startsWith("..") || isAbsolute(rel)) return undefined;
		return filePath;
	}

	/**
	 * Build or rebuild the manifest from the filesystem. Pass a project slug to
	 * rescan only that project — the rest of the graph is reused.
	 */
	async rebuild(slug?: string): Promise<Manifest> {
		const targets =
			slug === undefined ? this.roots : this.roots.filter((root) => root.slug === slug);

		for (const root of targets) {
			this.graphs.set(root.slug, await buildRootGraph(this.config, root, this.roots));
		}

		// Reloaded every rebuild: a build running alongside `weft serve` rewrites
		// its contribution file, and the graph should follow.
		this.manifest = mergeGraphs(
			this.config,
			this.roots,
			this.graphs,
			await loadContributions(this.config)
		);
		this.searchIndex.build(this.manifest, (nodeId) => this.resolveNodePath(nodeId));
		return this.manifest;
	}

	/** Get the current manifest, building it if necessary. */
	async getManifest(): Promise<Manifest> {
		if (!this.manifest) {
			this.manifest = await this.rebuild();
		}
		return this.manifest;
	}

	/**
	 * Write the manifest to disk. In multi-project mode this writes one manifest
	 * per project, an index of them, and the merged manifest at the project root.
	 * Returns every path written.
	 */
	async writeManifest(): Promise<string[]> {
		const manifest = await this.getManifest();
		const written: string[] = [];

		const write = (path: string, data: unknown) => {
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, JSON.stringify(data, null, 2));
			written.push(path);
		};

		if (this.namespaced) {
			for (const projectManifest of splitManifest(manifest, this.roots)) {
				write(this.projectManifestPath(projectManifest.project.slug), projectManifest);
			}

			const index: ProjectsIndex = {
				version: 1,
				projects: this.roots.map((root) => ({
					name: root.name ?? root.slug,
					slug: root.slug,
					docsDir: root.dir,
					manifest: `${root.dir}/.weft/manifest.json`,
				})),
				manifest: ".weft/manifest.json",
			};
			write(this.projectsIndexPath, index);
		}

		write(this.manifestPath, manifest);
		return written;
	}

	/**
	 * Read a document's content.
	 *
	 * An artifact is refused rather than read. Reading a binary as UTF-8 does not
	 * throw — it returns a lossy decode — so without this the caller receives
	 * nonsense wearing every sign of success, a 200 and a body, instead of an
	 * error it can act on.
	 */
	read(nodeId: string): string {
		const node = this.manifest?.nodes.find((candidate) => candidate.id === nodeId);
		// The extension stands in for the type when the manifest is not built yet,
		// and catches a path that was never a document in the first place.
		if (node?.type === "artifact" || !getDocType(nodeId)) {
			throw new Error(`Not a readable document: ${nodeId}`);
		}

		const filePath = this.resolveNodePath(nodeId);
		if (!filePath) throw new Error(`Document not found: ${nodeId}`);
		return readFileSync(filePath, "utf-8");
	}

	/**
	 * Run the validation stage over the current manifest, building it first if
	 * necessary. Pass a registry to run a different set of checks than the
	 * built-in ones.
	 */
	async validate(registry: ValidatorRegistry = defaultRegistry()): Promise<ValidationResult> {
		return validateManifest(await this.getManifest(), this.config, registry);
	}

	/** Search the index. */
	async search(query: string): Promise<SearchResult[]> {
		await this.getManifest(); // Ensure index is built
		return this.searchIndex.search(query);
	}

	/** Traverse the graph: find edges connected to a node. */
	async traverse(
		nodeId: string,
		direction: "outgoing" | "incoming" | "both" = "both"
	): Promise<WeftEdge[]> {
		const manifest = await this.getManifest();
		return manifest.edges.filter((edge) => {
			if (direction === "outgoing" || direction === "both") {
				if (edge.from.node === nodeId) return true;
			}
			if (direction === "incoming" || direction === "both") {
				if (edge.to.node === nodeId) return true;
			}
			return false;
		});
	}

	/** Watch every docs root for changes, rebuilding the changed project on change. */
	watch(callback?: (manifest: Manifest) => void): () => void {
		const watchers = this.roots.map((root) => {
			const watcher = chokidar.watch(root.absDir, {
				ignored: [
					/(^|[/\\])\../, // dotfiles
					"**/.weft/**", // manifest output
					...this.config.ignore,
				],
				persistent: true,
				ignoreInitial: true,
			});

			let debounceTimer: ReturnType<typeof setTimeout> | null = null;

			const onChangeDebounced = () => {
				if (debounceTimer) clearTimeout(debounceTimer);
				debounceTimer = setTimeout(async () => {
					const manifest = await this.rebuild(root.slug);
					callback?.(manifest);
				}, 200);
			};

			watcher.on("add", onChangeDebounced);
			watcher.on("change", onChangeDebounced);
			watcher.on("unlink", onChangeDebounced);

			return () => {
				watcher.close();
				if (debounceTimer) clearTimeout(debounceTimer);
			};
		});

		return () => {
			for (const stop of watchers) stop();
		};
	}
}
