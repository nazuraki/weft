import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getService } from '$lib/server/service.js';
import { parseOpenApiSpec } from '@weft/core';

export const GET: RequestHandler = async ({ params }) => {
	const service = await getService();
	try {
		const content = service.read(params.path);
		const spec = parseOpenApiSpec(content);
		if (!spec) throw error(422, `Not a valid OpenAPI spec: ${params.path}`);
		return json({ spec });
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(404, `Document not found: ${params.path}`);
	}
};
