import { json } from '@sveltejs/kit';
import { getService } from '$lib/server/service.js';

export async function GET() {
	const service = await getService();
	const manifest = await service.getManifest();
	return json(manifest);
}
