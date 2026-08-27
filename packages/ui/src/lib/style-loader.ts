/**
 * The styleUrl escape hatch: load a ui-std-lib theme the installed
 * @nazuraki/styles package does not know, from a base URL serving the styles
 * layout (`<base>/manifest.json`, `<base>/<name>/index.css`) — e.g. a pinned
 * jsDelivr `.../styles` path.
 *
 * Everything lands in `document.head`: theme CSS is guarded by data-nb-style
 * rather than scoped to an element, so a <link> is the only way in. Failures
 * warn and leave the mount on its fallback palette — a docs reader with
 * default colors beats one that refuses to render because a CDN blipped.
 */

interface RemoteManifest {
	themes?: Record<string, { scheme?: string; fonts?: string[] }>;
}

function injectLink(href: string): void {
	if (document.head.querySelector(`link[href="${CSS.escape(href)}"]`)) return;
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = href;
	document.head.appendChild(link);
}

/**
 * Inject stylesheet + font links for `names` served from `styleUrl`.
 *
 * @param opts.stylesheets - false when the sheet <link>s are already in the
 * document (the standalone layout emits them server-side); fonts are always
 * resolved here, because only the remote manifest knows them.
 */
export async function loadRemoteStyles(
	styleUrl: string,
	names: string[],
	opts: { stylesheets: boolean }
): Promise<void> {
	if (!names.length) return;
	const base = styleUrl.replace(/\/$/, "");

	if (opts.stylesheets) {
		for (const name of names) injectLink(`${base}/${encodeURIComponent(name)}/index.css`);
	}

	try {
		const res = await fetch(`${base}/manifest.json`);
		if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
		const manifest = (await res.json()) as RemoteManifest;
		for (const name of names) {
			const entry = manifest.themes?.[name];
			if (!entry) {
				console.warn(`weft: styleUrl manifest at ${base} does not list "${name}"`);
				continue;
			}
			for (const font of entry.fonts ?? []) injectLink(font);
		}
	} catch (e) {
		console.warn(`weft: could not read styleUrl manifest from ${base}:`, e);
	}
}
