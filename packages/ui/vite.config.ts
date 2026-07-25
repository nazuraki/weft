import { resolve } from "node:path";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: [
			{
				find: "@weft/core/browser",
				replacement: resolve(__dirname, "../../packages/core/src/browser.ts"),
			},
			{ find: "@weft/core", replacement: resolve(__dirname, "../../packages/core/src/index.ts") },
		],
	},
	ssr: {
		// Bundle @weft/core into SSR since it's a workspace package with TypeScript sources
		noExternal: ["@weft/core"],
	},
});
