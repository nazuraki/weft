/**
 * Starts the @weft/ui Vite dev server against this repo's own docs/ directory.
 *
 *   node scripts/dev-server.mjs [--port 5173]
 *
 * Two things this handles that `vite dev` on its own does not:
 *   - WEFT_ROOT_DIR has to point at the repo root, otherwise getService() falls
 *     back to process.cwd() (packages/ui) and the manifest comes up empty.
 *   - cwd has to be packages/ui: SvelteKit's Vite plugin overrides the `root`
 *     option with process.cwd() and resolves svelte.config.js and src/app.html
 *     from there.
 */

import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const uiDir = resolve(rootDir, "packages/ui");

const portFlag = process.argv.indexOf("--port");
const port = portFlag === -1 ? 5173 : Number(process.argv[portFlag + 1]);

process.env.WEFT_ROOT_DIR = rootDir;
process.chdir(uiDir);

// vite lives in packages/ui/node_modules under pnpm's strict layout, and ESM
// resolution keys off this file's location rather than the cwd set above.
const require = createRequire(`${uiDir}/package.json`);
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);

const server = await createServer({ server: { port } });
await server.listen();
server.printUrls();
