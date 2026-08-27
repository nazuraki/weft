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
		expect(tokens).not.toMatch(/(^|\})\s*:root/);
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
 * The three-namespace contract. `--weft-*` is the host's input and Weft only
 * ever reads it; `--nb-*` belongs to @nazuraki/styles and Weft only ever reads
 * it; `--w-*` is private and declared in `app.css` alone, each one resolving
 * host override → active theme token → literal fallback.
 */
describe("the public/theme/private token split", () => {
	it("never declares a public token, only reads one", () => {
		// `@property` registers a name without a `:` declaration, so it counts too.
		expect(tokens).not.toMatch(/--weft-[\w-]+\s*:[^;]/);
		expect(tokens).not.toMatch(/@property\s+--weft-/);
		expect(tokens).toMatch(/var\(--weft-/);
	});

	it("never declares a design-system token — @nazuraki/styles owns --nb-*", () => {
		const offenders = [resolve(SRC, "app.css"), ...styleBearingFiles()].filter((file) =>
			/--nb-[\w-]+\s*:[^;]*;/.test(readFileSync(file, "utf-8").replace(/var\([^)]*\)/g, ""))
		);
		expect(offenders).toEqual([]);
	});

	it("gives every public token a fallback, so a host that sets none still renders", () => {
		const bare = [...tokens.matchAll(/var\(\s*(--weft-[\w-]+)\s*\)/g)].map((m) => m[1]);
		expect([...new Set(bare)]).toEqual([]);
	});

	it("chains every color and font through the theme layer", () => {
		// Each --w-* color/font declaration must read a --nb-* token somewhere in
		// its fallback chain — otherwise a theme swap silently misses it. Layout
		// lengths (widths, heights) are Weft's own and exempt.
		const decls = [...tokens.matchAll(/(--w-[\w-]+)\s*:([^;]+);/g)];
		expect(decls.length).toBeGreaterThan(0);
		const exempt = /^--w-(lhn-width|rhs-width|header-height)$/;
		const missing = decls
			.filter(([, name]) => !exempt.test(name))
			.filter(([, , value]) => !value.includes("var(--nb-"))
			.map(([, name]) => name);
		expect(missing).toEqual([]);
	});

	it("declares its private tokens in app.css and nowhere else", () => {
		// A component <style> introducing its own token would be un-overridable
		// forever, and invisible to every other check here.
		const offenders = styleBearingFiles().filter((file) =>
			/--w(eft)?-[\w-]+\s*:[^;]*;/.test(readFileSync(file, "utf-8").replace(/var\([^)]*\)/g, ""))
		);
		expect(offenders).toEqual([]);
	});
});

/**
 * Scheme now arrives through which @nazuraki/styles theme block is active
 * (`data-nb-style`), not through weft-owned `data-theme` token blocks. What
 * remains pinned: Weft must never key token declarations off a bare attribute
 * selector that could match the host's markup.
 */
describe("theme attributes", () => {
	it("declares no data-theme token blocks of its own", () => {
		// The old light/dark blocks are gone; bringing one back would fork the
		// palette from the design system again.
		expect(tokens).not.toMatch(/\[data-theme=/);
	});

	it("keys nothing off a bare host-reachable attribute selector", () => {
		expect(tokens).not.toMatch(/(^|\})\s*\[data-(theme|nb-style)[^\]]*\]\s*[,{]/);
	});
});

describe("app-page.css (standalone app only)", () => {
	it("owns the rules that belong to a page Weft controls", () => {
		expect(page).toMatch(/^\s*\*,/m);
		expect(page).toMatch(/^html,/m);
	});

	it("imports no fonts — the layout emits per-theme links from the manifest", () => {
		expect(page).not.toContain("@import");
	});
});

describe("the standalone app", () => {
	const html = readFileSync(resolve(SRC, "app.html"), "utf-8");

	it("carries the scope class and the theme underlay on its root element", () => {
		// Tokens are declared on `.weft-scope`, so without this the standalone
		// app resolves every one of them to nothing — a failure no CSS-only check
		// can see, because the mistake is in an HTML file.
		expect(html).toMatch(/<html[^>]*\bclass="[^"]*\bweft-scope\b/);
		expect(html).toMatch(/<html[^>]*\bclass="[^"]*\bnb-bg\b/);
	});

	it("pre-paints both the scheme and the theme attribute", () => {
		// data-theme drives the doc-override contract and host mirroring;
		// data-nb-style is what the design-system CSS actually keys off. Setting
		// only one paints the wrong first frame.
		expect(html).toMatch(/setAttribute\("data-theme"/);
		expect(html).toMatch(/setAttribute\("data-nb-style"/);
	});
});
