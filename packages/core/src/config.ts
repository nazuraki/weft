import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { parse } from "yaml";
import { EXTENSION_MAP } from "./anchors/index.js";
import type { WeftConfig, WeftProjectRef } from "./types.js";

const CONFIG_FILES = ["weft.config.yaml", "weft.config.yml", "weft.config.json"];
const LEGACY_CONFIG_FILES = ["weft.config.ts", "weft.config.js", "weft.config.mjs"];

/**
 * Directories excluded from indexing by default.
 *
 * Build output under `docsDir` would otherwise be indexed as nodes alongside
 * the sources it was generated from, so every document would appear twice.
 * Only unambiguous output directory names are listed: `site`, `public`, `build`
 * and `out` are all commonly *source* directories, so excluding them by default
 * would silently hide real documents. Add those per project.
 */
const DEFAULTS: Omit<WeftConfig, "rootDir"> = {
	docsDir: "docs",
	entryPoint: "docs/README.md",
	ignore: ["**/node_modules/**", "**/dist/**", "**/_site/**", "**/_book/**", "**/.quarto/**"],
};

type UserConfig = Partial<Omit<WeftConfig, "rootDir">>;

const STRING_KEYS = ["docsDir", "entryPoint", "siteTitle", "siteUrl", "ogImage"] as const;
const STRING_ARRAY_KEYS = ["ignore", "docOrder", "contributions", "artifacts"] as const;
const ENUM_KEYS = {
	defaultTheme: ["light", "dark"],
	layout: ["reader", "default"],
} as const;
const KNOWN_KEYS = new Set<string>([
	...STRING_KEYS,
	...STRING_ARRAY_KEYS,
	...Object.keys(ENUM_KEYS),
	"docOrderStrict",
	"projects",
	"rules",
	"extensions",
]);

const DOC_TYPES = ["markdown", "openapi"];

const RULE_SEVERITIES = ["error", "warn", "info", "off"];

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Validate the parsed config's top-level shape. `projects` entries are validated in resolveDocsRoots. */
function validateUserConfig(raw: unknown, file: string): UserConfig {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		throw new Error(`weft config: ${file} must contain a top-level mapping of options`);
	}
	const config = raw as Record<string, unknown>;
	const fail = (key: string, expected: string) =>
		new Error(`weft config: "${key}" must be ${expected} (in ${file})`);

	for (const key of STRING_KEYS) {
		if (key in config && typeof config[key] !== "string") throw fail(key, "a string");
	}
	for (const key of STRING_ARRAY_KEYS) {
		if (key in config && !isStringArray(config[key])) throw fail(key, "an array of strings");
	}
	for (const [key, values] of Object.entries(ENUM_KEYS)) {
		if (key in config && !(values as readonly string[]).includes(config[key] as string)) {
			throw fail(key, values.map((v) => `"${v}"`).join(" or "));
		}
	}
	if ("docOrderStrict" in config && typeof config.docOrderStrict !== "boolean") {
		throw fail("docOrderStrict", "a boolean");
	}
	if ("projects" in config && !Array.isArray(config.projects)) {
		throw fail("projects", "an array");
	}
	if ("rules" in config) {
		const rules = config.rules;
		if (typeof rules !== "object" || rules === null || Array.isArray(rules)) {
			throw fail("rules", "a mapping of rule id to severity");
		}
		// Unknown rule ids are left to the validation stage to report — a config
		// may name a check that ships in a later version or in an external tool.
		for (const [id, severity] of Object.entries(rules)) {
			if (!RULE_SEVERITIES.includes(severity as string)) {
				throw fail(`rules.${id}`, RULE_SEVERITIES.map((v) => `"${v}"`).join(", "));
			}
		}
	}
	if ("extensions" in config) {
		const extensions = config.extensions;
		if (typeof extensions !== "object" || extensions === null || Array.isArray(extensions)) {
			throw fail("extensions", "a mapping of extension to doc type");
		}
		for (const [ext, docType] of Object.entries(extensions)) {
			if (!ext.startsWith(".")) {
				throw fail(`extensions["${ext}"]`, 'a key starting with "."');
			}
			if (!DOC_TYPES.includes(docType as string)) {
				throw fail(`extensions["${ext}"]`, DOC_TYPES.map((v) => `"${v}"`).join(" or "));
			}
			// Additive only: remapping a built-in extension would silently change
			// how every already-indexed file of that type parses. A value that
			// agrees with the built-in mapping is fine — it only opts an
			// unindexed-by-default type (e.g. .json) into scanning.
			const builtin = EXTENSION_MAP[ext];
			if (builtin && builtin !== docType) {
				throw new Error(
					`weft config: "extensions[${ext}]" cannot remap ${ext} — it is a built-in extension parsed as "${builtin}" and built-in mappings cannot be overridden (in ${file})`
				);
			}
		}
	}

	for (const key of Object.keys(config)) {
		if (!KNOWN_KEYS.has(key)) {
			console.warn(`weft config: ignoring unknown option "${key}" (in ${file})`);
		}
	}

	return config as UserConfig;
}

export async function loadConfig(rootDir: string): Promise<WeftConfig> {
	const absRoot = resolve(rootDir);

	for (const file of CONFIG_FILES) {
		const configPath = resolve(absRoot, file);
		if (!existsSync(configPath)) continue;

		const source = await readFile(configPath, "utf8");
		let raw: unknown;
		try {
			raw = parse(source);
		} catch (err) {
			throw new Error(`weft config: failed to parse ${file}: ${(err as Error).message}`);
		}

		return { ...DEFAULTS, ...validateUserConfig(raw ?? {}, file), rootDir: absRoot };
	}

	const legacy = LEGACY_CONFIG_FILES.find((file) => existsSync(resolve(absRoot, file)));
	if (legacy) {
		throw new Error(
			[
				`weft config: found ${legacy}, but JS/TS config files are no longer supported.`,
				"Move your options to weft.config.yaml — same keys, written as YAML:",
				"",
				"  docsDir: docs",
				"  docOrder:",
				"    - features.md",
				"",
				`Then delete ${legacy}. See the configuration docs for the full option list.`,
			].join("\n")
		);
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
