import { describe, it, expect } from 'vitest';
import { extractOpenApiAnchors, extractOpenApiTitle } from '../openapi.js';

describe('extractOpenApiAnchors', () => {
	it('extracts operation IDs', () => {
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
			'#listUsers',
			'#createUser'
		]);
	});

	it('extracts schema names from components', () => {
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
			'#/components/schemas/User',
			'#/components/schemas/Order'
		]);
	});

	it('falls back to path encoding when no operationId', () => {
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
		expect(anchors[0]).toMatch(/^#\/paths/);
	});
});

describe('extractOpenApiTitle', () => {
	it('extracts spec title', () => {
		const spec = `
openapi: "3.0.0"
info:
  title: My Cool API
`;
		expect(extractOpenApiTitle(spec)).toBe('My Cool API');
	});
});
