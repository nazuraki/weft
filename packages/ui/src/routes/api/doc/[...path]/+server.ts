import { getService } from "$lib/server/service.js";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";

export const GET: RequestHandler = async ({ params }) => {
	const service = await getService();
	try {
		const content = service.read(params.path);
		return json({ content });
	} catch {
		throw error(404, `Document not found: ${params.path}`);
	}
};
