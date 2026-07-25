import { getService } from "$lib/server/service.js";
import { nodeIdToPath, pathToNode } from "$lib/utils/paths.js";
import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types.js";

export const load: PageServerLoad = async ({ params }) => {
	const service = await getService();
	const manifest = await service.getManifest();
	const { siteTitle, siteUrl, ogImage } = service.weftConfig;

	// In multi-project mode there is no bare README.md — fall back to the first
	// project's README before giving up on the first node in the manifest.
	const firstProject = manifest.projects?.[0]?.slug;
	const node =
		pathToNode(params.path ?? "", manifest.nodes) ??
		manifest.nodes.find((n) => n.id === "README.md") ??
		(firstProject ? manifest.nodes.find((n) => n.id === `${firstProject}/README.md`) : undefined) ??
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
