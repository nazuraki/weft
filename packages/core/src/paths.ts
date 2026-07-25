import { sep } from "node:path";

/**
 * Convert a native path to a POSIX-style graph id.
 *
 * Node ids are POSIX everywhere they are consumed — manifest entries, URLs,
 * and `docOrder` in weft.config.ts — but node:path's `relative()` and glob
 * both emit `\` separators on Windows, which would produce ids like
 * `schemas\user.md` that never match their POSIX counterparts.
 */
export function toPosixPath(path: string): string {
	return sep === "/" ? path : path.split(sep).join("/");
}
