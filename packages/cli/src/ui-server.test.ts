import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WeftService } from "@weft/core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BUILT_HANDLER, chooseUiMode, routeRequest } from "./ui-server.js";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES_DIR = resolve(__dirname, "__fixtures__");

describe("chooseUiMode", () => {
	const dirs: string[] = [];
	function uiRoot(opts: { build?: boolean; source?: boolean }): string {
		const dir = mkdtempSync(join(tmpdir(), "weft-ui-"));
		dirs.push(dir);
		if (opts.build) {
			mkdirSync(join(dir, "build"));
			writeFileSync(join(dir, BUILT_HANDLER), "");
		}
		if (opts.source) writeFileSync(join(dir, "svelte.config.js"), "");
		return dir;
	}
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it("prefers the build when both build and source exist", () => {
		expect(chooseUiMode(uiRoot({ build: true, source: true }), false)).toBe("built");
	});

	it("serves the build when only the build exists (a published package)", () => {
		expect(chooseUiMode(uiRoot({ build: true }), false)).toBe("built");
	});

	it("falls back to the source tree when nothing is built", () => {
		expect(chooseUiMode(uiRoot({ source: true }), false)).toBe("dev");
	});

	it("--dev forces the source tree over an existing build", () => {
		expect(chooseUiMode(uiRoot({ build: true, source: true }), true)).toBe("dev");
	});

	it("--dev without a source tree is an error, not a silent fallback", () => {
		expect(() => chooseUiMode(uiRoot({ build: true }), true)).toThrow(/--dev needs/);
	});

	it("names the missing build when there is no UI at all", () => {
		expect(() => chooseUiMode(uiRoot({}), false)).toThrow(/build\/handler\.js/);
	});
});

describe("routeRequest", () => {
	let server: Server;
	let base: string;
	const uiSeen: string[] = [];

	beforeAll(async () => {
		const service = new WeftService({
			rootDir: FIXTURES_DIR,
			docsDir: "docs",
			entryPoint: "docs/README.md",
			ignore: [],
		});
		await service.rebuild();

		// A stand-in for adapter-node's handler: records the url it was given and
		// echoes it, so the tests can see exactly what reached the UI.
		const ui = (req: IncomingMessage, res: ServerResponse) => {
			uiSeen.push(req.url ?? "");
			res.setHeader("Content-Type", "text/plain");
			res.end(`ui:${req.url}`);
		};
		server = createServer(routeRequest(service, ui));
		await new Promise<void>((done) => server.listen(0, done));
		const address = server.address();
		if (!address || typeof address === "string") throw new Error("no port");
		base = `http://127.0.0.1:${address.port}`;
	});
	afterAll(() => server.close());
	afterEach(() => uiSeen.splice(0));

	it("serves the API with the /api mount point stripped", async () => {
		const res = await fetch(`${base}/api/doc/architecture.md`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("application/json");
		const body = (await res.json()) as { content: string };
		expect(body.content).toContain("# Architecture");
		expect(uiSeen).toEqual([]);
	});

	it("passes the query string through to the API", async () => {
		const res = await fetch(`${base}/api/search?q=architecture`);
		expect(res.status).toBe(200);
		expect(await res.json()).not.toEqual([]);
	});

	it("treats a bare /api as the API root, as Vite's mount does", async () => {
		const res = await fetch(`${base}/api`);
		expect(res.status).toBe(404);
		expect(((await res.json()) as { error: string }).error).toMatch(/Unknown API route: \//);
		expect(uiSeen).toEqual([]);
	});

	it("hands every other path to the UI untouched", async () => {
		const res = await fetch(`${base}/docs/architecture?x=1`);
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("ui:/docs/architecture?x=1");
		expect(uiSeen).toEqual(["/docs/architecture?x=1"]);
	});

	it("does not mistake a path that merely starts with 'api' for the API", async () => {
		const res = await fetch(`${base}/apiary`);
		expect(await res.text()).toBe("ui:/apiary");
	});
});
