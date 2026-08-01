import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(fileURLToPath(import.meta.url), "../../..", "src");

/** Rules only — a comment's `*` continuation lines look exactly like a selector. */
function rules(file: string): string {
	return readFileSync(resolve(SRC, file), "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");
}

const tokens = rules("app.css");
const page = rules("app-page.css");

/**
 * `app.css` ships inside `@weft/embed`, which may be dropped into a document
 * Weft does not own. Anything global in it reaches the host's markup, so the
 * split between these two files is a contract rather than tidiness — and one
 * that is easy to undo by adding "just one" rule to the wrong file.
 */
describe("app.css (shipped in the embed bundle)", () => {
	it("styles no element it was not given", () => {
		expect(tokens).not.toMatch(/^\s*html\b/m);
		expect(tokens).not.toMatch(/^\s*body\b/m);
	});

	it("carries no global reset", () => {
		// A bare `*` selector at the start of a rule, as opposed to `.weft-scope *`.
		expect(tokens).not.toMatch(/^\s*\*[\s,{]/m);
	});

	it("pulls in no remote stylesheet", () => {
		// A host did not ask Weft to make a network request on their page.
		expect(tokens).not.toContain("@import");
	});

	it("declares its tokens on a scope class as well as the document root", () => {
		// Without this an embedded mount would resolve every custom property to
		// nothing unless the host happened to apply them at :root.
		expect(tokens).toMatch(/:root,\s*\.weft-scope/);
	});

	it("scopes its base styles to that class", () => {
		expect(tokens).toMatch(/\.weft-scope\s*\{/);
		expect(tokens).toMatch(/\.weft-scope \*/);
	});

	it("leaves the theme blocks unqualified, so a mount can set its own scheme", () => {
		// `[data-theme="dark"]` matches any element carrying the attribute. Tying
		// it to :root would make an embedded mount unable to differ from the host.
		expect(tokens).toMatch(/^\[data-theme="dark"\]/m);
		expect(tokens).toMatch(/^\[data-theme="light"\]/m);
	});
});

describe("app-page.css (standalone app only)", () => {
	it("owns the rules that belong to a page Weft controls", () => {
		expect(page).toMatch(/^\s*\*,/m);
		expect(page).toMatch(/^html,/m);
		expect(page).toContain("@import");
	});
});
