import { readManifest } from "$lib/server/manifest.js";
import type { LayoutServerLoad } from "./$types.js";

export const load: LayoutServerLoad = async () => {
	const manifest = readManifest();
	const { defaultTheme, style, styleUrl, layout } = manifest.site ?? {};
	return {
		manifest,
		defaultTheme: defaultTheme ?? null,
		style: style ?? null,
		styleUrl: styleUrl ?? null,
		layout: layout ?? "default",
	};
};
