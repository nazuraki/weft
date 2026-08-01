import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./frontmatter.js";

function frontmatter(yaml: string): ReturnType<typeof parseFrontmatter>["data"] {
	return parseFrontmatter(`---\n${yaml}\n---\n# Title\n`).data;
}

describe("parseFrontmatter", () => {
	it("parses the fields the indexer consumes", () => {
		const data = frontmatter("title: API\ntheme: dark\ndescription: Reference\nogImage: /og.png");

		expect(data).toMatchObject({
			title: "API",
			theme: "dark",
			description: "Reference",
			ogImage: "/og.png",
		});
	});

	it("returns no data and the whole document when there is no frontmatter", () => {
		const { data, body } = parseFrontmatter("# Title\n");

		expect(data).toEqual({});
		expect(body).toBe("# Title\n");
	});

	it("strips the frontmatter block from the body", () => {
		expect(parseFrontmatter("---\ntitle: A\n---\n# Title\n").body).toBe("# Title\n");
	});
});

describe("parseFrontmatter (version)", () => {
	it("reads a quoted version", () => {
		expect(frontmatter('version: "2.41"').version).toBe("2.41");
	});

	it("reads an unquoted version as a string", () => {
		expect(frontmatter("version: 2.41").version).toBe("2.41");
	});

	it("keeps a trailing zero YAML would otherwise drop", () => {
		// Unquoted 2.10 parses as the number 2.1, which would report a mismatch
		// against a document that plainly says 2.10.
		expect(frontmatter("version: 2.10").version).toBe("2.10");
	});

	it("keeps a version that is only digits as written", () => {
		expect(frontmatter("version: 7").version).toBe("7");
	});

	it("reads a version that is not a number at all", () => {
		expect(frontmatter("version: 1.2.3-rc1").version).toBe("1.2.3-rc1");
	});

	it("leaves version absent when the document declares none", () => {
		expect(frontmatter("title: Registry").version).toBeUndefined();
	});

	it("leaves version absent when the key is present but empty", () => {
		// An append-only registry has no version, and absence must not be an error.
		expect(frontmatter("version:").version).toBeUndefined();
	});

	it("does not invent a version from a document with no frontmatter", () => {
		expect(parseFrontmatter("# Title\n").data.version).toBeUndefined();
	});
});
