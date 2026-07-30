import { parse } from "yaml";
import type { Anchor } from "../types.js";

/** Parse an OpenAPI YAML/JSON spec and return the raw object, or undefined if invalid. */
export function parseOpenApiSpec(content: string): Record<string, unknown> | undefined {
	try {
		const spec = parse(content);
		if (!spec || typeof spec !== "object") return undefined;
		return spec as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

/**
 * Extract anchors from an OpenAPI YAML/JSON spec: operation IDs and schema names.
 *
 * These carry no `line` or `level`: they are positions in a parsed object, not
 * headings in a source file, and the parser discards source offsets. `text` is
 * the operation id or schema name the slug was built from.
 */
export function extractOpenApiAnchors(content: string): Anchor[] {
	const spec = parse(content);
	if (!spec || typeof spec !== "object") return [];

	const anchors: Anchor[] = [];

	// Extract from paths — operation IDs or method+path combos
	if (spec.paths && typeof spec.paths === "object") {
		for (const [path, methods] of Object.entries(spec.paths)) {
			if (!methods || typeof methods !== "object") continue;
			for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
				if (!operation || typeof operation !== "object" || !isHttpMethod(method)) continue;
				const op = operation as Record<string, unknown>;
				if (typeof op.operationId === "string") {
					anchors.push({ slug: `#${op.operationId}`, text: op.operationId });
				} else {
					anchors.push({
						slug: `#/paths${path.replace(/\//g, "~1")}/${method}`,
						text: `${method.toUpperCase()} ${path}`,
					});
				}
			}
		}
	}

	// Extract from components/schemas
	const schemas = spec.components?.schemas ?? spec.definitions; // OpenAPI 2.x
	if (schemas && typeof schemas === "object") {
		for (const name of Object.keys(schemas)) {
			anchors.push({ slug: `#/components/schemas/${name}`, text: name });
		}
	}

	return anchors;
}

/** Extract the title from an OpenAPI spec. */
export function extractOpenApiTitle(content: string): string | undefined {
	const spec = parse(content);
	return spec?.info?.title;
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);
function isHttpMethod(method: string): boolean {
	return HTTP_METHODS.has(method.toLowerCase());
}
