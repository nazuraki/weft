import { getService } from "$lib/server/service.js";
import type { LayoutServerLoad } from "./$types.js";

export const load: LayoutServerLoad = async () => {
	const service = await getService();
	const manifest = await service.getManifest();
	const { defaultTheme, layout } = service.weftConfig;
	return { manifest, defaultTheme: defaultTheme ?? null, layout: layout ?? "default" };
};
