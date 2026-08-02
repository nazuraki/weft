import { cpSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkFreshness, computeInputsHash } from "./freshness.js";
import { buildManifest } from "./manifest.js";
import type { WeftConfig } from "./types.js";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES_DIR = resolve(__dirname, "__fixtures__");

function fixtureConfig(overrides: Partial<WeftConfig> = {}): WeftConfig {
	return {
		rootDir: FIXTURES_DIR,
		docsDir: "docs",
		entryPoint: "docs/README.md",
		ignore: [],
		...overrides,
	};
}

const tempDirs: string[] = [];

/** A writable copy of the docs fixture, so a test can mutate the tree. */
function copyDocsFixture(): string {
	const dir = mkdtempSync(resolve(tmpdir(), "weft-freshness-"));
	tempDirs.push(dir);
	cpSync(resolve(FIXTURES_DIR, "docs"), resolve(dir, "docs"), { recursive: true });
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("computeInputsHash", () => {
	it("is stable across two computations of an unchanged tree", async () => {
		const config = fixtureConfig();
		expect(await computeInputsHash(config)).toBe(await computeInputsHash(config));
	});

	it("changes when a document is added", async () => {
		const dir = copyDocsFixture();
		const config = fixtureConfig({ rootDir: dir });
		const before = await computeInputsHash(config);

		writeFileSync(resolve(dir, "docs", "extra.md"), "# Extra\n");

		expect(await computeInputsHash(config)).not.toBe(before);
	});

	it("changes when a document is deleted", async () => {
		const dir = copyDocsFixture();
		const config = fixtureConfig({ rootDir: dir });
		const before = await computeInputsHash(config);

		rmSync(resolve(dir, "docs", "architecture.md"));

		expect(await computeInputsHash(config)).not.toBe(before);
	});

	it("changes when a .weft sidecar changes", async () => {
		const dir = copyDocsFixture();
		writeFileSync(resolve(dir, "docs", "architecture.md.weft"), "links: []\n");
		const config = fixtureConfig({ rootDir: dir });
		const before = await computeInputsHash(config);

		writeFileSync(resolve(dir, "docs", "architecture.md.weft"), "links:\n  - target: README.md\n");

		expect(await computeInputsHash(config)).not.toBe(before);
	});

	it("changes when a contribution file changes", async () => {
		const dir = copyDocsFixture();
		writeFileSync(resolve(dir, "build.json"), JSON.stringify({ version: 1, nodes: [] }));
		const config = fixtureConfig({ rootDir: dir, contributions: ["build.json"] });
		const before = await computeInputsHash(config);

		writeFileSync(
			resolve(dir, "build.json"),
			JSON.stringify({ version: 1, nodes: [{ id: "generated.md", type: "markdown" }] })
		);

		expect(await computeInputsHash(config)).not.toBe(before);
	});

	it("changes when weft.config.yaml changes", async () => {
		const dir = copyDocsFixture();
		writeFileSync(resolve(dir, "weft.config.yaml"), "docsDir: docs\n");
		const config = fixtureConfig({ rootDir: dir });
		const before = await computeInputsHash(config);

		writeFileSync(resolve(dir, "weft.config.yaml"), "docsDir: docs\nignore:\n  - archive/**\n");

		expect(await computeInputsHash(config)).not.toBe(before);
	});

	it("changes when an artifact is added", async () => {
		const dir = copyDocsFixture();
		const config = fixtureConfig({ rootDir: dir, artifacts: ["**/*.pdf"] });
		const before = await computeInputsHash(config);

		writeFileSync(resolve(dir, "docs", "handbook.pdf"), "%PDF-1.4\n");

		expect(await computeInputsHash(config)).not.toBe(before);
	});

	it("changes when an artifact is deleted", async () => {
		const dir = copyDocsFixture();
		writeFileSync(resolve(dir, "docs", "handbook.pdf"), "%PDF-1.4\n");
		const config = fixtureConfig({ rootDir: dir, artifacts: ["**/*.pdf"] });
		const before = await computeInputsHash(config);

		rmSync(resolve(dir, "docs", "handbook.pdf"));

		expect(await computeInputsHash(config)).not.toBe(before);
	});

	it("does not change when only a file's mtime changes", async () => {
		// Regression guard against code deliberately not written (DD-4): this
		// earns its place by stopping mtime from creeping back in later, not by
		// exercising any behaviour the hash is supposed to have.
		const dir = copyDocsFixture();
		const config = fixtureConfig({ rootDir: dir });
		const before = await computeInputsHash(config);

		const future = new Date(Date.now() + 60_000);
		utimesSync(resolve(dir, "docs", "architecture.md"), future, future);

		expect(await computeInputsHash(config)).toBe(before);
	});

	it("does not change when a document-shaped file lands inside .weft/ (DD-15)", async () => {
		// The self-invalidating-loop guard. manifest.json itself would not have
		// exercised this: .json is not an indexed extension, so it never matched
		// the doc glob regardless of the ignore. A .md file is the one thing the
		// doc glob would pick up — except `glob` also excludes dot-directories
		// from `**` by default, independent of the ignore list, so this passes
		// even with IGNORE_MANIFEST_OUTPUT removed (verified by hand, not by this
		// test). It stays as documentation of intent and as the guard that
		// matters the day a `dot: true` option gets added to one of these globs.
		const dir = copyDocsFixture();
		const config = fixtureConfig({ rootDir: dir });
		const before = await computeInputsHash(config);

		mkdirSync(resolve(dir, "docs", ".weft"), { recursive: true });
		writeFileSync(resolve(dir, "docs", ".weft", "extra.md"), "# Extra\n");

		expect(await computeInputsHash(config)).toBe(before);
	});

	it("produces the same hash for a CRLF and an LF working tree", async () => {
		const dir = copyDocsFixture();
		writeFileSync(resolve(dir, "docs", "architecture.md.weft"), "links: []\r\n");
		const crlf = await computeInputsHash(fixtureConfig({ rootDir: dir }));

		writeFileSync(resolve(dir, "docs", "architecture.md.weft"), "links: []\n");
		const lf = await computeInputsHash(fixtureConfig({ rootDir: dir }));

		expect(crlf).toBe(lf);
	});
});

describe("checkFreshness", () => {
	it("reports unknown for a manifest with no build block", async () => {
		const config = fixtureConfig();
		const manifest = await buildManifest(config);
		manifest.build = undefined;

		expect(await checkFreshness(manifest, config)).toEqual({ status: "unknown" });
	});

	it("reports fresh for an untouched tree", async () => {
		const config = fixtureConfig();
		const manifest = await buildManifest(config);

		expect((await checkFreshness(manifest, config)).status).toBe("fresh");
	});

	it("reports stale after a document is edited", async () => {
		const dir = copyDocsFixture();
		const config = fixtureConfig({ rootDir: dir });
		const manifest = await buildManifest(config);

		writeFileSync(resolve(dir, "docs", "architecture.md"), "# Changed\n");

		expect((await checkFreshness(manifest, config)).status).toBe("stale");
	});

	it("reports stale after a document is added", async () => {
		const dir = copyDocsFixture();
		const config = fixtureConfig({ rootDir: dir });
		const manifest = await buildManifest(config);

		writeFileSync(resolve(dir, "docs", "extra.md"), "# Extra\n");

		expect((await checkFreshness(manifest, config)).status).toBe("stale");
	});

	it("reports stale after a document is deleted", async () => {
		const dir = copyDocsFixture();
		const config = fixtureConfig({ rootDir: dir });
		const manifest = await buildManifest(config);

		rmSync(resolve(dir, "docs", "architecture.md"));

		expect((await checkFreshness(manifest, config)).status).toBe("stale");
	});

	it("reports stale after an artifact is added", async () => {
		const dir = copyDocsFixture();
		const config = fixtureConfig({ rootDir: dir, artifacts: ["**/*.pdf"] });
		const manifest = await buildManifest(config);

		writeFileSync(resolve(dir, "docs", "handbook.pdf"), "%PDF-1.4\n");

		expect((await checkFreshness(manifest, config)).status).toBe("stale");
	});

	it("reports stale after an artifact is deleted", async () => {
		const dir = copyDocsFixture();
		writeFileSync(resolve(dir, "docs", "handbook.pdf"), "%PDF-1.4\n");
		const config = fixtureConfig({ rootDir: dir, artifacts: ["**/*.pdf"] });
		const manifest = await buildManifest(config);

		rmSync(resolve(dir, "docs", "handbook.pdf"));

		expect((await checkFreshness(manifest, config)).status).toBe("stale");
	});

	it("carries the manifest's builtAt through a stale result", async () => {
		const dir = copyDocsFixture();
		const config = fixtureConfig({ rootDir: dir });
		const manifest = await buildManifest(config);

		writeFileSync(resolve(dir, "docs", "extra.md"), "# Extra\n");

		expect((await checkFreshness(manifest, config)).builtAt).toBe(manifest.build?.builtAt);
	});
});
