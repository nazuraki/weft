import { getService } from "$lib/server/service.js";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get("q");
	if (!query) throw error(400, 'Missing query parameter "q"');

	const service = await getService();
	const results = await service.search(query);
	return json(results);
};
