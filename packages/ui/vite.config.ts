import { resolve } from "node:path";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: [
			{
				find: "@lepid-labs/weft-core/browser",
				replacement: resolve(__dirname, "../../packages/core/src/browser.ts"),
			},
			{
				find: "@lepid-labs/weft-core",
				replacement: resolve(__dirname, "../../packages/core/src/index.ts"),
			},
		],
	},
	ssr: {
		// Bundle @lepid-labs/weft-core into SSR since it's a workspace package with TypeScript sources
		noExternal: ["@lepid-labs/weft-core"],
	},
});
