import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeftService } from "./service.js";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES_DIR = resolve(__dirname, "__fixtures__");

/**
 * Hooks into the mocked `checkFreshness` below: `hold` keeps a check open
 * after it has its answer in hand, so a test can complete a `rebuild()` in
 * exactly the window between computing a freshness result and caching it —
 * the interleaving an MCP server handling concurrent tool calls produces
 * naturally, and one no amount of sequencing through the public API can pin
 * down deterministically.
 */
const gate: { hold: Promise<void> | null; reached: (() => void) | null; calls: number } = {
	hold: null,
	reached: null,
	calls: 0,
};

vi.mock("./freshness.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./freshness.js")>();
	return {
		...actual,
		checkFreshness: async (...args: Parameters<typeof actual.checkFreshness>) => {
			gate.calls++;
			const result = await actual.checkFreshness(...args);
			gate.reached?.();
			if (gate.hold) await gate.hold;
			return result;
		},
	};
});

const tempDirs: string[] = [];

function createWritableService(): { dir: string; service: WeftService } {
	const dir = mkdtempSync(resolve(tmpdir(), "weft-concurrency-"));
	tempDirs.push(dir);
	cpSync(resolve(FIXTURES_DIR, "docs"), resolve(dir, "docs"), { recursive: true });
	const service = new WeftService({
		rootDir: dir,
		docsDir: "docs",
		entryPoint: "docs/README.md",
		ignore: [],
	});
	return { dir, service };
}

afterEach(() => {
	gate.hold = null;
	gate.reached = null;
	gate.calls = 0;
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("WeftService freshness under concurrency", () => {
	it("never caches a check that a rebuild overtook", async () => {
		const { dir, service } = createWritableService();
		await service.getManifest();
		writeFileSync(resolve(dir, "docs", "architecture.md"), "# Changed\n");

		let release!: () => void;
		gate.hold = new Promise<void>((r) => {
			release = r;
		});
		const reached = new Promise<void>((r) => {
			gate.reached = r;
		});

		const inFlight = service.freshness();
		// The check has computed `stale` but not yet written it to the cache.
		await reached;
		await service.rebuild();
		release();

		// The overlapped caller still gets the honest answer for when it asked…
		expect((await inFlight).status).toBe("stale");
		// …but that answer was not cached over the rebuild's state: within the
		// cache window, the next call re-checks and sees the rebuilt manifest.
		expect((await service.freshness()).status).toBe("fresh");
	});

	it("coalesces concurrent cache misses onto one tree re-read", async () => {
		const { service } = createWritableService();
		await service.getManifest();
		gate.calls = 0;

		const [first, second] = await Promise.all([service.freshness(), service.freshness()]);

		expect(first.status).toBe("fresh");
		expect(second.status).toBe("fresh");
		expect(gate.calls).toBe(1);
	});
});
