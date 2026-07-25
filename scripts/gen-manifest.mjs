/**
 * Generates docs/.weft/manifest.json from the project's docs/ directory.
 * Run after building @weft/core (tsc), which populates packages/core/dist/.
 *
 *   node scripts/gen-manifest.mjs
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

// WEFT_CONFIG bypasses weft.config.ts loading (which requires tsx)
process.env.WEFT_CONFIG = JSON.stringify({
	rootDir,
	docsDir: "docs",
	entryPoint: "docs/README.md",
	ignore: ["**/node_modules/**", "**/dist/**"],
});

const { WeftService } = await import("../packages/core/dist/service.js");

const config = JSON.parse(process.env.WEFT_CONFIG);
const service = new WeftService(config);
const outPaths = await service.writeManifest();

for (const outPath of outPaths) {
	console.log(`Manifest written to ${outPath}`);
}
