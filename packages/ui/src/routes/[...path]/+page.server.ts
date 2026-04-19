import { getService } from "$lib/server/service.js";
import { nodeIdToPath, pathToNode } from "$lib/utils/paths.js";
import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types.js";

export const load: PageServerLoad = async ({ params }) => {
	const service = await getService();
	const manifest = await service.getManifest();
	const { siteTitle, siteUrl, ogImage } = service.weftConfig;

	const node =
		pathToNode(params.path ?? "", manifest.nodes) ??
		manifest.nodes.find((n) => n.id === "README.md") ??
		manifest.nodes[0];

	if (!node) error(404, "No documents found.");

	const canonical = nodeIdToPath(node.id);
	const requested = `/${params.path ?? ""}`;
	if (canonical !== requested) redirect(302, canonical);

	return {
		nodeId: node.id,
		og: {
			title: node.title,
			description: node.description ?? null,
			image: node.ogImage ?? ogImage ?? null,
			siteTitle: siteTitle ?? null,
			siteUrl: siteUrl ?? null,
		},
	};
};
