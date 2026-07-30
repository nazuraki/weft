import { describe, expect, it } from "vitest";
import { countLines, hashContent, normalizeContent } from "./content.js";

const BOM = "\uFEFF";

describe("normalizeContent", () => {
	it("converts CRLF to LF", () => {
		expect(normalizeContent("a\r\nb\r\n")).toBe("a\nb\n");
	});

	it("strips a leading BOM", () => {
		expect(normalizeContent(`${BOM}# Title`)).toBe("# Title");
	});

	it("leaves a BOM-like character that is not leading alone", () => {
		expect(normalizeContent(`a${BOM}b`)).toBe(`a${BOM}b`);
	});

	it("leaves already-normalized content untouched", () => {
		expect(normalizeContent("a\nb\n")).toBe("a\nb\n");
	});
});

describe("hashContent", () => {
	it("is stable for identical content", () => {
		expect(hashContent("# Title\n")).toBe(hashContent("# Title\n"));
	});

	it("changes when the content changes", () => {
		expect(hashContent("# Title\n")).not.toBe(hashContent("# Title!\n"));
	});

	// The point of normalizing: git does not preserve line endings across
	// platforms, so a raw-byte hash would report every document as changed the
	// moment CI checked it out with different ones.
	it("is identical for CRLF and LF versions of the same document", () => {
		expect(hashContent("# Title\n\nBody.\n")).toBe(hashContent("# Title\r\n\r\nBody.\r\n"));
	});

	it("is identical with and without a BOM", () => {
		expect(hashContent("# Title\n")).toBe(hashContent(`${BOM}# Title\n`));
	});

	it("covers frontmatter, not just the body", () => {
		const withTitle = "---\ntitle: A\n---\n\nBody.\n";
		const withOther = "---\ntitle: B\n---\n\nBody.\n";

		expect(hashContent(withTitle)).not.toBe(hashContent(withOther));
	});

	it("is a short lowercase hex digest", () => {
		expect(hashContent("anything")).toMatch(/^[0-9a-f]{16}$/);
	});

	// Documented so an external build can declare a hash rather than have Weft
	// recompute it: strip BOM, CRLF to LF, SHA-256, first 16 hex characters.
	it("matches a SHA-256 of the normalized text computed independently", async () => {
		const { createHash } = await import("node:crypto");
		const content = "# Title\r\n";
		const expected = createHash("sha256").update("# Title\n", "utf8").digest("hex").slice(0, 16);

		expect(hashContent(content)).toBe(expected);
	});
});

describe("countLines", () => {
	it("does not count a trailing newline as another line", () => {
		expect(countLines("a\nb\nc\n")).toBe(3);
	});

	it("counts a final line with no trailing newline", () => {
		expect(countLines("a\nb\nc")).toBe(3);
	});

	it("counts a single line", () => {
		expect(countLines("just one line")).toBe(1);
	});

	it("counts blank lines between content", () => {
		expect(countLines("a\n\nb\n")).toBe(3);
	});

	it("returns 0 for an empty document", () => {
		expect(countLines("")).toBe(0);
	});

	it("counts CRLF content the same as LF", () => {
		expect(countLines("a\r\nb\r\nc\r\n")).toBe(countLines("a\nb\nc\n"));
	});
});
