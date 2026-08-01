import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(fileURLToPath(import.meta.url), "../../..", "src");

/** Rules only — a comment's `*` continuation lines look exactly like a selector. */
function rules(file: string): string {
	return readFileSync(resolve(SRC, file), "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Every file under `src` that can carry a `<style>` block or CSS. */
function styleBearingFiles(): string[] {
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = resolve(dir, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (/\.(svelte|css)$/.test(entry.name) && entry.name !== "app.css") out.push(path);
		}
	};
	walk(SRC);
	return out;
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

	it("scopes its base styles to the scope class", () => {
		expect(tokens).toMatch(/\.weft-scope\s*\{/);
		expect(tokens).toMatch(/\.weft-scope \*/);
	});
});

/**
 * The two-namespace contract. `--weft-*` is the host's input and Weft only ever
 * reads it; `--w-*` is private and declared in `app.css` alone.
 *
 * This is not naming taste. A value declared on an element beats an inherited
 * one at any specificity, so the moment Weft declares a public name a host can
 * no longer set it from an ancestor — which is the only place the docs tell
 * them to set it.
 */
describe("the public/private token split", () => {
	it("never declares a public token, only reads one", () => {
		// `@property` registers a name without a `:` declaration, so it counts too.
		expect(tokens).not.toMatch(/--weft-[\w-]+\s*:/);
		expect(tokens).not.toMatch(/@property\s+--weft-/);
		expect(tokens).toMatch(/var\(--weft-/);
	});

	it("gives every public token a fallback, so a host that sets none still renders", () => {
		const bare = [...tokens.matchAll(/var\(\s*(--weft-[\w-]+)\s*\)/g)].map((m) => m[1]);
		expect([...new Set(bare)]).toEqual([]);
	});

	it("declares its private tokens in app.css and nowhere else", () => {
		// A component <style> introducing its own token would be un-overridable
		// forever, and invisible to every other check here.
		const offenders = styleBearingFiles().filter((file) =>
			/--w(eft)?-[\w-]+\s*:/.test(readFileSync(file, "utf-8"))
		);
		expect(offenders).toEqual([]);
	});
});

/**
 * The theme blocks are the leak this rework exists to close, and the fix has a
 * sharp edge of its own.
 */
describe("the theme blocks", () => {
	it("cannot reach the host's markup", () => {
		// The old shape — a bare `[data-theme="dark"]` — matches ANY element with
		// the attribute, so a host theming its own page inherited Weft's tokens and
		// a real `color-scheme`. Anchored on a rule boundary rather than line start:
		// the formatter de-indents top-level rules, so `^` would forbid the correct
		// implementation while missing the bug indented or second in a comma list.
		expect(tokens).not.toMatch(/(^|\})\s*\[data-theme="(dark|light)"\]\s*[,{]/);
	});

	it("keys off Weft's own markup, on the scope or inside it", () => {
		// On the scope: the standalone app's <html>, or an embedded mount that has
		// mirrored its host's theme onto itself. Inside it: the per-document
		// override, which can only ever match markup Weft rendered.
		expect(tokens).toMatch(/\.weft-scope\[data-theme="dark"\]/);
		expect(tokens).toMatch(/\.weft-scope\s+\[data-theme="dark"\]/);
	});

	it("has no host-ancestor branch, which could not be ranked by proximity", () => {
		// `[data-theme="dark"] .weft-scope` and its light twin both match a mount
		// inside a themed host, at identical (0,2,0) — so source order rather than
		// nearest ancestor would decide, and a mount asking to be dark inside a
		// light page rendered light. CSS cannot express "nearest wins";
		// `DocReader` resolves the value in JS instead, which is why this shape
		// must not come back.
		expect(tokens).not.toMatch(/\[data-theme="(dark|light)"\]\s+\.weft-scope/);
	});
});

describe("app-page.css (standalone app only)", () => {
	it("owns the rules that belong to a page Weft controls", () => {
		expect(page).toMatch(/^\s*\*,/m);
		expect(page).toMatch(/^html,/m);
		expect(page).toContain("@import");
	});
});

describe("the standalone app", () => {
	it("carries the scope class on its root element", () => {
		// Tokens are declared on `.weft-scope` now, so without this the standalone
		// app resolves every one of them to nothing — a failure no CSS-only check
		// can see, because the mistake is in an HTML file.
		const html = readFileSync(resolve(SRC, "app.html"), "utf-8");
		expect(html).toMatch(/<html[^>]*\bclass="[^"]*\bweft-scope\b/);
	});
});
