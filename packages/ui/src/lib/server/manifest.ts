import { readFileSync } from "node:fs";
import type { Manifest } from "@weft/core";

/**
 * Read the manifest written by `weft serve` (the CLI owns the WeftService and
 * keeps this file current via its watcher). Read fresh on every request so SSR
 * picks up rebuilds. SvelteKit's server-side fetch cannot reach the CLI's /api
 * middleware, hence the file handoff.
 */
export function readManifest(): Manifest {
	const path = process.env.WEFT_MANIFEST_PATH;
	if (!path) {
		throw new Error(
			"WEFT_MANIFEST_PATH is not set — the Weft UI must be launched via `weft serve`."
		);
	}
	return JSON.parse(readFileSync(path, "utf-8")) as Manifest;
}
