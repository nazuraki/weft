type Theme = "light" | "dark";

function createThemeStore() {
	let base = $state<Theme>("dark");
	let docOverride = $state<Theme | null>(null);

	function resolveBase(): Theme {
		const saved = localStorage.getItem("weft-theme") as Theme | null;
		const configDefault = document
			.querySelector('meta[name="weft-default-theme"]')
			?.getAttribute("content") as Theme | null;
		const sys = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
		return saved ?? configDefault ?? sys;
	}

	function apply(theme: Theme) {
		document.documentElement.setAttribute("data-theme", theme);
	}

	function init() {
		base = resolveBase();

		window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
			if (
				!localStorage.getItem("weft-theme") &&
				!document.querySelector('meta[name="weft-default-theme"]')
			) {
				base = resolveBase();
				if (!docOverride) apply(base);
			}
		});
	}

	function set(theme: Theme, persist = true) {
		base = theme;
		if (persist) localStorage.setItem("weft-theme", theme);
		if (!docOverride) apply(base);
	}

	function toggle() {
		set(base === "dark" ? "light" : "dark");
	}

	function toggleDocOverride() {
		const visible = docOverride ?? base;
		docOverride = visible === "dark" ? "light" : "dark";
	}

	function setDocOverride(theme: Theme | null) {
		docOverride = theme;
	}

	return {
		get current(): Theme {
			return docOverride ?? base;
		},
		get docOverride(): Theme | null {
			return docOverride;
		},
		init,
		toggle,
		toggleDocOverride,
		setDocOverride,
	};
}

export const theme = createThemeStore();
