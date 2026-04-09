import { getService } from "$lib/server/service.js";
import type { LayoutServerLoad } from "./$types.js";

export const load: LayoutServerLoad = async () => {
	const service = await getService();
	const manifest = await service.getManifest();
	return { manifest };
};
