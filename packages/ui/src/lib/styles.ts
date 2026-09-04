import type { StyleConfig } from "@lepid-labs/weft-core/browser";
/**
 * The ui-std-lib theme roster, read from the installed @nazuraki/styles
 * manifest — the single source of theme names, schemes, and webfont links.
 * Nothing here hardcodes a theme list, so a styles-package upgrade is the
 * whole cost of adopting a new theme, and `styleUrl` covers one the installed
 * package does not know yet.
 */
import styleManifest from "@nazuraki/styles/manifest";

interface StyleManifest {
	contract: number;
	themes: Record<string, { scheme: "dark" | "light"; fonts: string[] }>;
}

const manifest = styleManifest as StyleManifest;

export type Scheme = "dark" | "light";

/** The default pair: nocturnal luminous-precision, summer-cloud for light. */
export const DEFAULT_PAIR = { dark: "luminous-precision", light: "summer-cloud" } as const;

/** The scheme a bundled theme renders in, or undefined for an unknown name. */
export function schemeOf(style: string): Scheme | undefined {
	return manifest.themes[style]?.scheme;
}

export function isBundledStyle(style: string): boolean {
	return style in manifest.themes;
}

export function bundledStyleNames(): string[] {
	return Object.keys(manifest.themes);
}

/**
 * A style config resolved onto the scheme axis. A pair fills both halves; a
 * single name fills only the half matching its scheme — the missing half is
 * the "no toggle" signal. A single *unknown* name (the styleUrl path, where
 * the local manifest cannot say which scheme it is) lands on `dark` by
 * convention; the pre-paint script clamps to whatever halves exist either way.
 */
export function resolveStylePair(style?: StyleConfig): { dark?: string; light?: string } {
	if (!style) return { ...DEFAULT_PAIR };
	if (typeof style === "string") {
		const scheme = schemeOf(style) ?? "dark";
		return { [scheme]: style };
	}
	return { dark: style.dark, light: style.light };
}

/**
 * Reject a theme name nothing can serve: not in the bundled manifest, and no
 * `styleUrl` to fetch it from. Throwing beats silently rendering the literal
 * fallback palette while the config says luminous-precision.
 */
export function assertServableStyles(style: StyleConfig | undefined, styleUrl?: string): void {
	if (!style || styleUrl) return;
	const names = typeof style === "string" ? [style] : [style.dark, style.light];
	for (const name of names) {
		if (!isBundledStyle(name)) {
			throw new Error(
				`Weft: unknown style "${name}" — bundled styles are ${bundledStyleNames().join(", ")}; pass styleUrl to load a newer one`
			);
		}
	}
}

/** Deduped Google Fonts URLs for the bundled themes among `names`. */
export function fontsFor(names: Array<string | undefined>): string[] {
	const urls = new Set<string>();
	for (const name of names) {
		if (!name) continue;
		for (const url of manifest.themes[name]?.fonts ?? []) urls.add(url);
	}
	return [...urls];
}
