import { parse } from "yaml";

export interface Frontmatter {
	title?: string;
	theme?: "light" | "dark";
	[key: string]: unknown;
}

/** Strip and parse YAML frontmatter from markdown content. */
export function parseFrontmatter(content: string): { data: Frontmatter; body: string } {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { data: {}, body: content };
	const data = (parse(match[1]) ?? {}) as Frontmatter;
	const body = content.slice(match[0].length);
	return { data, body };
}
