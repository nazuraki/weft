import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	isNamespaced,
	loadConfig,
	nodeIdFor,
	projectRefs,
	resolveDocsRoots,
	rootForNodeId,
	rootForPath,
	slugify,
} from "./config.js";
import type { WeftConfig } from "./types.js";

const ROOT = resolve("/project");

function config(overrides: Partial<WeftConfig> = {}): WeftConfig {
	return {
		rootDir: ROOT,
		docsDir: "docs",
		entryPoint: "docs/README.md",
		ignore: [],
		...overrides,
	};
}

describe("loadConfig", () => {
	const dirs: string[] = [];

	function tempRoot(files: Record<string, string> = {}): string {
		const dir = mkdtempSync(join(tmpdir(), "weft-config-"));
		dirs.push(dir);
		for (const [name, content] of Object.entries(files)) {
			writeFileSync(join(dir, name), content);
		}
		return dir;
	}

	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("returns defaults when no config file exists", async () => {
		const root = tempRoot();
		const config = await loadConfig(root);

		expect(config).toEqual({
			rootDir: resolve(root),
			docsDir: "docs",
			entryPoint: "docs/README.md",
			ignore: ["**/node_modules/**", "**/dist/**"],
		});
	});

	it("loads weft.config.yaml and merges defaults", async () => {
		const root = tempRoot({
			"weft.config.yaml": [
				"docsDir: documentation",
				"layout: reader",
				"docOrder:",
				"  - features.md",
				"docOrderStrict: true",
			].join("\n"),
		});

		const config = await loadConfig(root);
		expect(config.docsDir).toBe("documentation");
		expect(config.layout).toBe("reader");
		expect(config.docOrder).toEqual(["features.md"]);
		expect(config.docOrderStrict).toBe(true);
		expect(config.entryPoint).toBe("docs/README.md");
	});

	it("loads weft.config.yml", async () => {
		const root = tempRoot({ "weft.config.yml": "docsDir: d" });
		expect((await loadConfig(root)).docsDir).toBe("d");
	});

	it("loads weft.config.json", async () => {
		const root = tempRoot({ "weft.config.json": '{ "docsDir": "j" }' });
		expect((await loadConfig(root)).docsDir).toBe("j");
	});

	it("prefers .yaml over .yml and .json", async () => {
		const root = tempRoot({
			"weft.config.yaml": "docsDir: a",
			"weft.config.yml": "docsDir: b",
			"weft.config.json": '{ "docsDir": "c" }',
		});
		expect((await loadConfig(root)).docsDir).toBe("a");
	});

	it("treats an empty config file as all defaults", async () => {
		const root = tempRoot({ "weft.config.yaml": "" });
		expect((await loadConfig(root)).docsDir).toBe("docs");
	});

	it("rejects malformed yaml, naming the file", async () => {
		const root = tempRoot({ "weft.config.yaml": "docsDir: [unclosed" });
		await expect(loadConfig(root)).rejects.toThrow(/failed to parse weft\.config\.yaml/);
	});

	it("rejects a non-mapping top level", async () => {
		const root = tempRoot({ "weft.config.yaml": "- just\n- a\n- list" });
		await expect(loadConfig(root)).rejects.toThrow(/top-level mapping/);
	});

	it("rejects wrong field types, naming the field", async () => {
		const root = tempRoot({ "weft.config.yaml": "docsDir: [not, a, string]" });
		await expect(loadConfig(root)).rejects.toThrow(/"docsDir" must be a string/);
	});

	it("rejects non-string entries in string arrays", async () => {
		const root = tempRoot({ "weft.config.yaml": "docOrder:\n  - ok.md\n  - 42" });
		await expect(loadConfig(root)).rejects.toThrow(/"docOrder" must be an array of strings/);
	});

	it("rejects bad enum values", async () => {
		const root = tempRoot({ "weft.config.yaml": "layout: fancy" });
		await expect(loadConfig(root)).rejects.toThrow(/"layout" must be "reader" or "default"/);
	});

	it("rejects a non-boolean docOrderStrict", async () => {
		const root = tempRoot({ "weft.config.yaml": "docOrderStrict: yep" });
		await expect(loadConfig(root)).rejects.toThrow(/"docOrderStrict" must be a boolean/);
	});

	it("warns on unknown keys but still loads", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const root = tempRoot({ "weft.config.yaml": "docsDir: docs\ntypo: true" });

		expect((await loadConfig(root)).docsDir).toBe("docs");
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown option "typo"'));
	});

	it("loads per-rule severities", async () => {
		const root = tempRoot({
			"weft.config.yaml": ["rules:", "  edge-target-missing: warn", "  some-check: off"].join("\n"),
		});

		expect((await loadConfig(root)).rules).toEqual({
			"edge-target-missing": "warn",
			"some-check": "off",
		});
	});

	it("rejects a non-mapping rules block", async () => {
		const root = tempRoot({ "weft.config.yaml": "rules:\n  - edge-target-missing" });
		await expect(loadConfig(root)).rejects.toThrow(
			/"rules" must be a mapping of rule id to severity/
		);
	});

	it("rejects an unknown severity, naming the rule", async () => {
		const root = tempRoot({ "weft.config.yaml": "rules:\n  some-check: fatal" });
		await expect(loadConfig(root)).rejects.toThrow(
			/"rules\.some-check" must be "error", "warn", "info", "off"/
		);
	});

	it("rejects a legacy JS/TS config with a migration message", async () => {
		const root = tempRoot({ "weft.config.ts": "export default {};" });
		await expect(loadConfig(root)).rejects.toThrow(
			/found weft\.config\.ts.*no longer supported[\s\S]*weft\.config\.yaml/
		);
	});

	it("ignores a legacy config when a static config exists", async () => {
		const root = tempRoot({
			"weft.config.yaml": "docsDir: d",
			"weft.config.ts": "export default {};",
		});
		expect((await loadConfig(root)).docsDir).toBe("d");
	});
});

describe("resolveDocsRoots", () => {
	it("returns a single unnamespaced root when no projects are configured", () => {
		const roots = resolveDocsRoots(config());

		expect(roots).toHaveLength(1);
		expect(roots[0].slug).toBe("");
		expect(roots[0].dir).toBe("docs");
		expect(roots[0].absDir).toBe(resolve(ROOT, "docs"));
		expect(isNamespaced(roots)).toBe(false);
		expect(projectRefs(roots)).toEqual([]);
	});

	it("normalizes trailing slashes and ./ prefixes", () => {
		const roots = resolveDocsRoots(config({ docsDir: "./docs/" }));
		expect(roots[0].dir).toBe("docs");
	});

	it("resolves one root per configured project", () => {
		const roots = resolveDocsRoots(
			config({
				projects: [
					{ name: "Alpha", docsDir: "products/alpha/docs" },
					{ name: "Beta", docsDir: "products/beta/docs" },
				],
			})
		);

		expect(roots.map((r) => r.slug)).toEqual(["alpha", "beta"]);
		expect(roots[0].absDir).toBe(resolve(ROOT, "products/alpha/docs"));
		expect(isNamespaced(roots)).toBe(true);
	});

	it("derives a kebab-case slug from the project name", () => {
		const roots = resolveDocsRoots(
			config({ projects: [{ name: "Design System!", docsDir: "ds/docs" }] })
		);
		expect(roots[0].slug).toBe("design-system");
	});

	it("honours an explicit slug", () => {
		const roots = resolveDocsRoots(
			config({ projects: [{ name: "Beta", docsDir: "b/docs", slug: "b" }] })
		);
		expect(roots[0].slug).toBe("b");
	});

	it("exposes projects as manifest records", () => {
		const roots = resolveDocsRoots(
			config({ projects: [{ name: "Alpha", docsDir: "products/alpha/docs" }] })
		);

		expect(projectRefs(roots)).toEqual([
			{ name: "Alpha", slug: "alpha", docsDir: "products/alpha/docs" },
		]);
	});

	it("throws on an empty projects array", () => {
		expect(() => resolveDocsRoots(config({ projects: [] }))).toThrow(/non-empty array/);
	});

	it("throws on a project missing name", () => {
		expect(() => resolveDocsRoots(config({ projects: [{ docsDir: "a/docs" } as never] }))).toThrow(
			/missing "name"/
		);
	});

	it("throws on a project missing docsDir", () => {
		expect(() => resolveDocsRoots(config({ projects: [{ name: "Alpha" } as never] }))).toThrow(
			/missing "docsDir"/
		);
	});

	it("throws on duplicate slugs", () => {
		expect(() =>
			resolveDocsRoots(
				config({
					projects: [
						{ name: "Alpha", docsDir: "a/docs" },
						{ name: "alpha", docsDir: "b/docs" },
					],
				})
			)
		).toThrow(/duplicate project slug "alpha"/);
	});

	it("throws when a name yields an empty slug", () => {
		expect(() =>
			resolveDocsRoots(config({ projects: [{ name: "!!!", docsDir: "a/docs" }] }))
		).toThrow(/empty slug/);
	});
});

describe("slugify", () => {
	it("kebab-cases and strips punctuation", () => {
		expect(slugify("Alpha")).toBe("alpha");
		expect(slugify("  Design System  ")).toBe("design-system");
		expect(slugify("v2.0 API")).toBe("v2-0-api");
	});
});

describe("node id helpers", () => {
	const roots = resolveDocsRoots(
		config({
			projects: [
				{ name: "Alpha", docsDir: "products/alpha/docs" },
				{ name: "Beta", docsDir: "products/beta/docs" },
			],
		})
	);

	it("namespaces ids in multi-project mode", () => {
		expect(nodeIdFor(roots[0], "features.md")).toBe("alpha/features.md");
	});

	it("leaves ids bare in single-project mode", () => {
		const [single] = resolveDocsRoots(config());
		expect(nodeIdFor(single, "features.md")).toBe("features.md");
	});

	it("finds the root owning an absolute path", () => {
		const hit = rootForPath(roots, resolve(ROOT, "products/beta/docs/api.yaml"));
		expect(hit?.slug).toBe("beta");
	});

	it("returns undefined for a path outside every root", () => {
		expect(rootForPath(roots, resolve(ROOT, "src/main.ts"))).toBeUndefined();
	});

	it("prefers the most deeply nested root", () => {
		const nested = resolveDocsRoots(
			config({
				projects: [
					{ name: "Outer", docsDir: "docs" },
					{ name: "Inner", docsDir: "docs/inner" },
				],
			})
		);

		expect(rootForPath(nested, resolve(ROOT, "docs/inner/a.md"))?.slug).toBe("inner");
		expect(rootForPath(nested, resolve(ROOT, "docs/a.md"))?.slug).toBe("outer");
	});

	it("splits a node id into root and relative path", () => {
		expect(rootForNodeId(roots, "beta/api.yaml")).toMatchObject({
			relPath: "api.yaml",
			root: { slug: "beta" },
		});
	});

	it("returns undefined for an id with an unknown project", () => {
		expect(rootForNodeId(roots, "gamma/api.yaml")).toBeUndefined();
	});
});
