import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryDepth } from "./git.js";
import { WeftService } from "./service.js";
import type { WeftConfig } from "./types.js";
import { ValidatorRegistry } from "./validate/index.js";

// The point of these tests is counting subprocess spawns, so the walk itself
// is stubbed: every call lands in `walks` and yields an empty history, which
// both the indexer and validation accept as "git had nothing to say".
const walks: { dir: string; depth: HistoryDepth }[] = [];

vi.mock("./git.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("./git.js")>();
	const fileHistory = async (dir: string, depth: HistoryDepth = "full") => {
		walks.push({ dir, depth });
		return { dates: new Map(), blobs: new Map(), renames: new Map() };
	};
	return {
		...original,
		fileHistory,
		lastCommitDates: async (dir: string) => (await fileHistory(dir, "dates")).dates,
	};
});

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES_DIR = resolve(__dirname, "__fixtures__");

function createService(): WeftService {
	const config: WeftConfig = {
		rootDir: FIXTURES_DIR,
		docsDir: "docs",
		entryPoint: "docs/README.md",
		ignore: [],
	};
	return new WeftService(config);
}

/** A registry whose one rule reads no history. */
function historylessRegistry(): ValidatorRegistry {
	return new ValidatorRegistry().register({
		rules: [{ id: "no-history", description: "Reads no history", defaultSeverity: "info" }],
		run: () => [],
	});
}

beforeEach(() => {
	walks.length = 0;
});

describe("WeftService history walks", () => {
	it("walks git once per root, at full depth, when check builds and validates", async () => {
		// The regression in #54: indexing walked for dates and validation walked
		// again identically, so a one-root `weft check` ran `git log` twice.
		const service = createService();

		await service.validate();

		expect(walks).toEqual([{ dir: resolve(FIXTURES_DIR, "docs"), depth: "full" }]);
	});

	it("walks once at dates depth for a plain rebuild", async () => {
		const service = createService();

		await service.rebuild();

		expect(walks).toEqual([{ dir: resolve(FIXTURES_DIR, "docs"), depth: "dates" }]);
	});

	it("walks once at dates depth when no enabled rule reads history", async () => {
		const service = createService();

		await service.validate(historylessRegistry());

		expect(walks.map((walk) => walk.depth)).toEqual(["dates"]);
	});

	it("upgrades a dates walk to full once, then serves validation from cache", async () => {
		const service = createService();

		await service.rebuild();
		await service.validate();
		await service.validate();

		expect(walks.map((walk) => walk.depth)).toEqual(["dates", "full"]);
	});

	it("walks afresh after a rebuild invalidates the cached history", async () => {
		const service = createService();

		await service.validate();
		await service.rebuild();
		await service.validate();

		expect(walks.map((walk) => walk.depth)).toEqual(["full", "dates", "full"]);
	});
});
