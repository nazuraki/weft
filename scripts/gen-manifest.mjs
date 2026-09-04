/**
 * Generates docs/.weft/manifest.json from the project's docs/ directory.
 * Run after building @lepid-labs/weft-core (tsc), which populates packages/core/dist/.
 *
 *   node scripts/gen-manifest.mjs
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const { loadConfig } = await import("../packages/core/dist/config.js");
const { WeftService } = await import("../packages/core/dist/service.js");

const config = await loadConfig(rootDir);
const service = new WeftService(config);
const outPaths = await service.writeManifest();

for (const outPath of outPaths) {
	console.log(`Manifest written to ${outPath}`);
}
