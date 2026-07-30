import { describe, expect, it } from "vitest";
import {
	extractOpenApiAnchors,
	extractOpenApiTitle,
	openApiOperationAnchor,
	openApiSchemaAnchor,
} from "../openapi.js";

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

// The renderer stamps these same ids onto the elements it draws, by calling
// these same functions. If it computed them separately the two would agree only
// by coincidence, and an anchor would stop resolving the moment either changed.
describe("anchor ids shared with the renderer", () => {
	it("uses the operation id when there is one", () => {
		expect(openApiOperationAnchor("/users", "get", "listUsers")).toBe("listUsers");
	});

	it("falls back to an escaped path and method", () => {
		expect(openApiOperationAnchor("/users/{id}", "get")).toBe("/paths~1users~1{id}/get");
	});

	it("builds a schema id from the name", () => {
		expect(openApiSchemaAnchor("User")).toBe("/components/schemas/User");
	});

	it("produces exactly the anchors the extractor records, minus the leading #", () => {
		const spec = `
openapi: "3.0.0"
info:
  title: Test API
paths:
  /users:
    get:
      operationId: listUsers
  /users/{id}:
    delete:
      summary: No operation id here
components:
  schemas:
    User:
      type: object
`;
		const extracted = extractOpenApiAnchors(spec).map((a) => a.slug);

		expect(extracted).toEqual([
			`#${openApiOperationAnchor("/users", "get", "listUsers")}`,
			`#${openApiOperationAnchor("/users/{id}", "delete")}`,
			`#${openApiSchemaAnchor("User")}`,
		]);
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
