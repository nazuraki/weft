import type { LayoutServerLoad } from './$types.js';
import { getService } from '$lib/server/service.js';

export const load: LayoutServerLoad = async () => {
	const service = await getService();
	const manifest = await service.getManifest();
	return { manifest };
};
