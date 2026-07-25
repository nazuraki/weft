import { describe, expect, it } from "vitest";
import { nodeIdToDocPath } from "./node-path.js";
import type { Manifest } from "./types.js";

const SINGLE: Manifest = { version: 1, nodes: [], edges: [] };

const MULTI: Manifest = {
	version: 1,
	nodes: [],
	edges: [],
	projects: [
		{ name: "Alpha", slug: "alpha", docsDir: "products/alpha/docs" },
		{ name: "Beta", slug: "beta", docsDir: "products/beta/docs" },
	],
};

describe("nodeIdToDocPath", () => {
	it("passes bare ids through in single-project mode", () => {
		expect(nodeIdToDocPath(SINGLE, "README.md")).toBe("README.md");
		expect(nodeIdToDocPath(SINGLE, "guides/setup.md")).toBe("guides/setup.md");
	});

	it("resolves a namespaced id through its project docsDir", () => {
		expect(nodeIdToDocPath(MULTI, "alpha/features.md")).toBe("products/alpha/docs/features.md");
		expect(nodeIdToDocPath(MULTI, "beta/api.yaml")).toBe("products/beta/docs/api.yaml");
	});

	it("keeps nested paths inside a project", () => {
		expect(nodeIdToDocPath(MULTI, "alpha/guides/setup.md")).toBe(
			"products/alpha/docs/guides/setup.md"
		);
	});

	it("passes an id with no matching project through unchanged", () => {
		expect(nodeIdToDocPath(MULTI, "gamma/api.yaml")).toBe("gamma/api.yaml");
	});
});
