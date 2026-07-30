import { describe, expect, it } from "vitest";
import { extractOpenApiAnchors, extractOpenApiTitle } from "../openapi.js";

describe("extractOpenApiAnchors", () => {
	it("extracts operation IDs", () => {
		const spec = `
openapi: "3.0.0"
info:
  title: Test API
paths:
  /users:
    get:
      operationId: listUsers
    post:
      operationId: createUser
`;
		expect(extractOpenApiAnchors(spec)).toEqual([
			{ slug: "#listUsers", text: "listUsers" },
			{ slug: "#createUser", text: "createUser" },
		]);
	});

	it("extracts schema names from components", () => {
		const spec = `
openapi: "3.0.0"
info:
  title: Test API
components:
  schemas:
    User:
      type: object
    Order:
      type: object
`;
		expect(extractOpenApiAnchors(spec)).toEqual([
			{ slug: "#/components/schemas/User", text: "User" },
			{ slug: "#/components/schemas/Order", text: "Order" },
		]);
	});

	it("carries no line or level, having no source position", () => {
		const spec = `
openapi: "3.0.0"
info:
  title: Test API
paths:
  /users:
    get:
      operationId: listUsers
`;
		const [anchor] = extractOpenApiAnchors(spec);
		expect(anchor.line).toBeUndefined();
		expect(anchor.level).toBeUndefined();
	});

	it("falls back to path encoding when no operationId", () => {
		const spec = `
openapi: "3.0.0"
info:
  title: Test API
paths:
  /users/{id}:
    get:
      summary: Get user
`;
		const anchors = extractOpenApiAnchors(spec);
		expect(anchors[0].slug).toMatch(/^#\/paths/);
		expect(anchors[0].text).toBe("GET /users/{id}");
	});
});

describe("extractOpenApiTitle", () => {
	it("extracts spec title", () => {
		const spec = `
openapi: "3.0.0"
info:
  title: My Cool API
`;
		expect(extractOpenApiTitle(spec)).toBe("My Cool API");
	});
});
