/**
 * Fail the build if the embed bundle ships a rule that can reach the host page.
 *
 * A build step rather than a test, because it is an assertion about a file the
 * build has just written: run this way it can never read a stale artifact, can
 * never silently skip because the artifact is missing, and needs nothing added
 * to any test runner.
 *
 * It exists because the source-level checks in `styles.test.ts` cannot see this
 * class of bug. They passed while `:root` — which IS the host's `<html>`, at a
 * specificity the host cannot beat — carried `color-scheme` onto every page
 * that loaded the bundle, and they pass with a `:global(body)` rule dropped
 * into any component's `<style>`. Whatever the next shape is, it ends up here,
 * so this is where it is checked.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CSS = fileURLToPath(new URL("../dist/weft.css", import.meta.url));

/** Split a selector list on top-level commas only — `:is(h1,h2)` is one selector. */
function splitSelectors(group) {
	const out = [];
	let buffer = "";
	let depth = 0;

	for (const char of group) {
		if (char === "(") depth++;
		else if (char === ")") depth--;

		if (char === "," && depth === 0) {
			out.push(buffer);
			buffer = "";
		} else buffer += char;
	}

	out.push(buffer);
	return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * Every style-rule selector in the sheet.
 *
 * At-rule preludes are stripped rather than skipped: a regex anchored on `}`
 * cannot see the first rule inside an `@media` block, and
 * `@media (prefers-color-scheme)` is the likeliest place for a leak to hide.
 */
/**
 * Whole `@keyframes` blocks, removed before selector extraction — their step
 * selectors (`from`, `0%`) are not element selectors. The names are checked
 * separately: a keyframe name is page-global, so a generic one (`spin`) would
 * silently replace or be replaced by a host animation of the same name.
 */
const KEYFRAMES = /@keyframes\s+([\w-]+)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;

function selectorsIn(css) {
	const withoutKeyframes = css.replace(KEYFRAMES, "");
	const flattened = withoutKeyframes.replace(/@[^{}]+\{/g, "");

	return [...flattened.matchAll(/(^|\}|\{)([^{}]+)\{/g)].flatMap((match) =>
		splitSelectors(match[2])
	);
}

/**
 * Svelte emits `.svelte-<hash>` in this build; anything Weft owns carries one
 * of those or `.weft-scope`. `[data-nb-style` marks a @nazuraki/styles rule —
 * guarded by an attribute only Weft's own containers carry, so it cannot
 * reach host markup either.
 */
const SCOPED = /\.weft-scope|\.svelte-[\w-]+|\[data-nb-style/;

const source = readFileSync(CSS, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");

const badKeyframes = [...source.matchAll(KEYFRAMES)]
	.map((m) => m[1])
	.filter((name) => !/^(weft-|nb-|svelte-)/.test(name));
if (badKeyframes.length) {
	console.error(
		`weft: keyframe name(s) in dist/weft.css are not namespaced (weft-/nb-/svelte-): ${badKeyframes.join(", ")}\n`
	);
	process.exit(1);
}

const selectors = selectorsIn(source);
const unscoped = [...new Set(selectors.filter((selector) => !SCOPED.test(selector)))];

if (unscoped.length) {
	const list = unscoped.map((selector) => `    ${selector}`).join("\n");
	console.error(
		`weft: ${unscoped.length} rule(s) in dist/weft.css can reach the host's markup:\n${list}\n\nEverything the embed ships must be scoped to \`.weft-scope\` or to a Svelte component class.\n`
	);
	process.exit(1);
}

console.log(`weft: ${selectors.length} selectors, all scoped.`);
