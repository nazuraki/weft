import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { WeftConfig, WeftProjectRef } from "./types.js";

const CONFIG_FILES = ["weft.config.ts", "weft.config.js", "weft.config.mjs"];

const DEFAULTS: Omit<WeftConfig, "rootDir"> = {
	docsDir: "docs",
	entryPoint: "docs/README.md",
	ignore: ["**/node_modules/**", "**/dist/**"],
};

export function defineConfig(
	config: Partial<Omit<WeftConfig, "rootDir">>
): Partial<Omit<WeftConfig, "rootDir">> {
	return config;
}

export async function loadConfig(rootDir: string): Promise<WeftConfig> {
	// When the Vite plugin (or CLI serve command) has already resolved the config
	// via ssrLoadModule, it stores the result here to avoid re-executing the TS
	// config file (which would fail due to pnpm's strict node_modules isolation).
	if (process.env.WEFT_CONFIG) {
		return JSON.parse(process.env.WEFT_CONFIG) as WeftConfig;
	}

	const absRoot = resolve(rootDir);

	for (const file of CONFIG_FILES) {
		const configPath = resolve(absRoot, file);
		if (existsSync(configPath)) {
			const url = pathToFileURL(configPath).href;
			const mod = await import(url);
			const userConfig = mod.default ?? mod;
			return {
				...DEFAULTS,
				...userConfig,
				rootDir: absRoot,
			};
		}
	}

	return { ...DEFAULTS, rootDir: absRoot };
}

/** A resolved docs root — one per configured project, or one implicit root for `docsDir`. */
export interface DocsRoot {
	/** Display name. Undefined for the implicit single root. */
	name?: string;
	/** Id namespace. Empty string for the implicit single root. */
	slug: string;
	/** Directory relative to `rootDir`, POSIX separators, no trailing slash. */
	dir: string;
	/** Absolute directory path. */
	absDir: string;
}

/** Normalize a configured directory to a POSIX, trailing-slash-free relative path. */
function normalizeDir(dir: string): string {
	return dir.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

/** Kebab-case a project name into a URL-safe slug. */
export function slugify(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Resolve the configured docs roots. Without `projects` this is a single
 * unnamespaced root over `docsDir` — node ids stay relative to it, exactly as
 * before multi-project support existed.
 */
export function resolveDocsRoots(config: WeftConfig): DocsRoot[] {
	const { projects } = config;

	if (projects === undefined) {
		return [
			{
				slug: "",
				dir: normalizeDir(config.docsDir),
				absDir: resolve(config.rootDir, config.docsDir),
			},
		];
	}

	if (!Array.isArray(projects) || projects.length === 0) {
		throw new Error('weft config: "projects" must be a non-empty array');
	}

	const seen = new Set<string>();
	return projects.map((project, i) => {
		if (!project?.name) throw new Error(`weft config: projects[${i}] is missing "name"`);
		if (!project.docsDir) {
			throw new Error(`weft config: project "${project.name}" is missing "docsDir"`);
		}

		const slug = slugify(project.slug ?? project.name);
		if (!slug) {
			throw new Error(
				`weft config: project "${project.name}" resolves to an empty slug — set "slug" explicitly`
			);
		}
		if (seen.has(slug)) {
			throw new Error(`weft config: duplicate project slug "${slug}"`);
		}
		seen.add(slug);

		return {
			name: project.name,
			slug,
			dir: normalizeDir(project.docsDir),
			absDir: resolve(config.rootDir, project.docsDir),
		};
	});
}

/** True when node ids are namespaced by project slug. */
export function isNamespaced(roots: DocsRoot[]): boolean {
	return roots.some((root) => root.slug !== "");
}

/** Project records for the manifest. Empty unless namespaced. */
export function projectRefs(roots: DocsRoot[]): WeftProjectRef[] {
	if (!isNamespaced(roots)) return [];
	return roots.map((root) => ({
		name: root.name ?? root.slug,
		slug: root.slug,
		docsDir: root.dir,
	}));
}

/** Build a node id from a path relative to its root. */
export function nodeIdFor(root: DocsRoot, relPath: string): string {
	const posix = relPath.split(sep).join("/");
	return root.slug ? `${root.slug}/${posix}` : posix;
}

/** Find the root containing an absolute path. Longest match wins, so nested roots work. */
export function rootForPath(roots: DocsRoot[], absPath: string): DocsRoot | undefined {
	let best: DocsRoot | undefined;
	for (const root of roots) {
		const rel = relative(root.absDir, absPath);
		if (rel.startsWith("..") || isAbsolute(rel)) continue;
		if (!best || root.absDir.length > best.absDir.length) best = root;
	}
	return best;
}

/** Split a node id into its owning root and the path relative to that root. */
export function rootForNodeId(
	roots: DocsRoot[],
	nodeId: string
): { root: DocsRoot; relPath: string } | undefined {
	for (const root of roots) {
		if (!root.slug) return { root, relPath: nodeId };
		if (nodeId.startsWith(`${root.slug}/`)) {
			return { root, relPath: nodeId.slice(root.slug.length + 1) };
		}
	}
	return undefined;
}
