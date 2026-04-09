import { getService } from "$lib/server/service.js";
import { json } from "@sveltejs/kit";

export async function GET() {
	const service = await getService();
	const manifest = await service.getManifest();
	return json(manifest);
}
