type Theme = "light" | "dark";

function createThemeStore() {
	let current = $state<Theme>("dark");

	function init() {
		const attr = document.documentElement.getAttribute("data-theme");
		current = attr === "light" ? "light" : "dark";

		window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
			if (!localStorage.getItem("weft-theme")) {
				set(e.matches ? "light" : "dark");
			}
		});
	}

	function set(theme: Theme) {
		current = theme;
		document.documentElement.setAttribute("data-theme", theme);
		localStorage.setItem("weft-theme", theme);
	}

	function toggle() {
		set(current === "dark" ? "light" : "dark");
	}

	return {
		get current() {
			return current;
		},
		init,
		toggle,
	};
}

export const theme = createThemeStore();
