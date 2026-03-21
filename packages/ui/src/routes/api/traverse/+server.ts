import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getService } from '$lib/server/service.js';

export const GET: RequestHandler = async ({ url }) => {
	const nodeId = url.searchParams.get('node');
	if (!nodeId) throw error(400, 'Missing query parameter "node"');

	const direction = (url.searchParams.get('direction') ?? 'both') as 'outgoing' | 'incoming' | 'both';
	const service = await getService();
	const edges = await service.traverse(nodeId, direction);
	return json(edges);
};
