import { untrack } from "svelte";

type Theme = "light" | "dark";

/**
 * Scheme and style are two axes with one knob. The config's style pair maps
 * each scheme to a ui-std-lib theme name; the user's choice (and localStorage)
 * is only ever the SCHEME. Storing the style name instead would let a stale
 * preference pin a theme the config no longer names — config decides styles,
 * the user decides light or dark.
 */
function createThemeStore() {
	let base = $state<Theme>("dark");
	let docOverride = $state<Theme | null>(null);
	let stylePair = $state<{ dark?: string; light?: string }>({});
	let warnedSingle = false;

	const readMeta = (name: string): string | null =>
		document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null;

	function availableSchemes(): Theme[] {
		const out: Theme[] = [];
		if (stylePair.dark) out.push("dark");
		if (stylePair.light) out.push("light");
		// No style metas at all (an embed host that set none): both schemes
		// remain selectable and only the literal fallbacks change.
		return out.length ? out : ["dark", "light"];
	}

	function clamp(theme: Theme): Theme {
		const available = availableSchemes();
		return available.includes(theme) ? theme : available[0];
	}

	function resolveBase(): Theme {
		const saved = localStorage.getItem("weft-theme") as Theme | null;
		const configDefault = readMeta("weft-default-theme") as Theme | null;
		const sys = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
		return clamp(saved ?? configDefault ?? sys);
	}

	function apply(theme: Theme) {
		document.documentElement.setAttribute("data-theme", theme);
		const style = stylePair[theme];
		if (style) document.documentElement.setAttribute("data-nb-style", style);
		else document.documentElement.removeAttribute("data-nb-style");
	}

	function init() {
		// untracked: init writes stylePair and then reads it back through
		// resolveBase()/clamp(). Called from an $effect, that read would register
		// the write as the effect's own dependency and loop it forever.
		untrack(() => {
			stylePair = {
				dark: readMeta("weft-style-dark") ?? undefined,
				light: readMeta("weft-style-light") ?? undefined,
			};
			base = resolveBase();
			apply(base);
		});

		window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
			if (!localStorage.getItem("weft-theme") && !readMeta("weft-default-theme")) {
				base = resolveBase();
				if (!docOverride) apply(base);
			}
		});
	}

	function set(theme: Theme, persist = true) {
		base = clamp(theme);
		if (persist) localStorage.setItem("weft-theme", base);
		if (!docOverride) apply(base);
	}

	function toggle() {
		set(base === "dark" ? "light" : "dark");
	}

	function toggleDocOverride() {
		const visible = docOverride ?? base;
		setDocOverride(visible === "dark" ? "light" : "dark");
	}

	function setDocOverride(theme: Theme | null) {
		if (theme && !availableSchemes().includes(theme)) {
			// A single-style deployment has nowhere to flip to; say so once
			// rather than silently rendering the same scheme.
			if (!warnedSingle) {
				console.warn(`weft: ignoring ${theme} override — this deployment has no ${theme} style`);
				warnedSingle = true;
			}
			docOverride = null;
			return;
		}
		docOverride = theme;
	}

	return {
		get current(): Theme {
			return docOverride ?? base;
		},
		get docOverride(): Theme | null {
			return docOverride;
		},
		/** The theme name a scheme renders in, for override elements. */
		styleFor(scheme: Theme): string | undefined {
			return stylePair[scheme];
		},
		/** False when the config names a single style — the toggle hides. */
		get canToggle(): boolean {
			return availableSchemes().length > 1;
		},
		init,
		toggle,
		toggleDocOverride,
		setDocOverride,
	};
}

export const theme = createThemeStore();
