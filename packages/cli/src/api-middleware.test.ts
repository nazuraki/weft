import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WeftService } from "@weft/core";
import type { WeftEdge } from "@weft/core";
import { beforeAll, describe, expect, it } from "vitest";
import { handleApiRequest } from "./api-middleware.js";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES_DIR = resolve(__dirname, "__fixtures__");

let service: WeftService;

beforeAll(async () => {
	service = new WeftService({
		rootDir: FIXTURES_DIR,
		docsDir: "docs",
		entryPoint: "docs/README.md",
		ignore: [],
	});
	await service.rebuild();
});

/** Run one request through the handler and capture the JSON response. */
// biome-ignore lint/suspicious/noExplicitAny: test helper — each assertion narrows the shape it uses
async function request(url: string): Promise<{ status: number; body: any }> {
	let status = 0;
	let payload = "";
	const res = {
		set statusCode(code: number) {
			status = code;
		},
		setHeader() {},
		end(chunk: string) {
			payload = chunk;
		},
	} as unknown as ServerResponse;

	await handleApiRequest(service, { url } as IncomingMessage, res);
	return { status, body: JSON.parse(payload) };
}

describe("handleApiRequest", () => {
	it("serves the manifest", async () => {
		const { status, body } = await request("/manifest");
		expect(status).toBe(200);
		expect(body.nodes.map((n: { id: string }) => n.id).sort()).toEqual([
			"README.md",
			"architecture.md",
		]);
		expect(body.edges.length).toBeGreaterThan(0);
	});

	it("serves document content", async () => {
		const { status, body } = await request("/doc/architecture.md");
		expect(status).toBe(200);
		expect(body.content).toContain("# Architecture");
	});

	it("404s for a missing document", async () => {
		const { status, body } = await request("/doc/nope.md");
		expect(status).toBe(404);
		expect(body.error).toContain("nope.md");
	});

	it("404s for a document path escaping the docs root", async () => {
		const { status } = await request("/doc/..%2F..%2Fpackage.json");
		expect(status).toBe(404);
	});

	it("serves search results", async () => {
		const { status, body } = await request("/search?q=weaving");
		expect(status).toBe(200);
		expect(body.some((r: { id: string }) => r.id === "architecture.md")).toBe(true);
	});

	it("400s on a missing search query", async () => {
		const { status, body } = await request("/search");
		expect(status).toBe(400);
		expect(body.error).toContain('"q"');
	});

	it("serves traverse edges in both directions", async () => {
		const outgoing = await request("/traverse?node=README.md&direction=outgoing");
		expect(outgoing.status).toBe(200);
		expect(outgoing.body.some((e: WeftEdge) => e.to.node === "architecture.md")).toBe(true);

		const incoming = await request("/traverse?node=architecture.md&direction=incoming");
		expect(incoming.body.some((e: WeftEdge) => e.from.node === "README.md")).toBe(true);
	});

	it("400s on a missing traverse node", async () => {
		const { status } = await request("/traverse");
		expect(status).toBe(400);
	});

	it("404s on unknown routes", async () => {
		const { status, body } = await request("/openapi/api.yaml");
		expect(status).toBe(404);
		expect(body.error).toContain("Unknown API route");
	});
});
