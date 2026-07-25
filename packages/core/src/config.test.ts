import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	isNamespaced,
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
