import path from "node:path";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	plugins: [svelte()],
	build: {
		lib: {
			entry: path.resolve(__dirname, "src/index.ts"),
			name: "Weft",
			fileName: "weft",
			formats: ["es", "iife"],
		},
		cssCodeSplit: false,
	},
	resolve: {
		alias: {
			// Resolve SvelteKit's $lib alias to the UI package's lib directory
			$lib: path.resolve(__dirname, "../ui/src/lib"),
		},
	},
	// Prevent Vite from trying to bundle Node.js built-ins referenced by @weft/core's
	// server-side modules (they're tree-shaken away, but need to be marked external
	// at the rollup level so the browser build doesn't choke on them)
	optimizeDeps: {
		exclude: ["@weft/core"],
	},
	ssr: {
		noExternal: [],
	},
});
