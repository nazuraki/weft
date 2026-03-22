import { parse } from 'yaml';

/** Parse an OpenAPI YAML/JSON spec and return the raw object, or undefined if invalid. */
export function parseOpenApiSpec(content: string): Record<string, unknown> | undefined {
	try {
		const spec = parse(content);
		if (!spec || typeof spec !== 'object') return undefined;
		return spec as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

/** Extract anchors from an OpenAPI YAML/JSON spec: operation IDs and schema names. */
export function extractOpenApiAnchors(content: string): string[] {
	const spec = parse(content);
	if (!spec || typeof spec !== 'object') return [];

	const anchors: string[] = [];

	// Extract from paths — operation IDs or method+path combos
	if (spec.paths && typeof spec.paths === 'object') {
		for (const [path, methods] of Object.entries(spec.paths)) {
			if (!methods || typeof methods !== 'object') continue;
			for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
				if (!operation || typeof operation !== 'object' || !isHttpMethod(method)) continue;
				const op = operation as Record<string, unknown>;
				if (typeof op.operationId === 'string') {
					anchors.push(`#${op.operationId}`);
				} else {
					anchors.push(`#/paths${path.replace(/\//g, '~1')}/${method}`);
				}
			}
		}
	}

	// Extract from components/schemas
	const schemas =
		spec.components?.schemas ??
		spec.definitions; // OpenAPI 2.x
	if (schemas && typeof schemas === 'object') {
		for (const name of Object.keys(schemas)) {
			anchors.push(`#/components/schemas/${name}`);
		}
	}

	return anchors;
}

/** Extract the title from an OpenAPI spec. */
export function extractOpenApiTitle(content: string): string | undefined {
	const spec = parse(content);
	return spec?.info?.title;
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
function isHttpMethod(method: string): boolean {
	return HTTP_METHODS.has(method.toLowerCase());
}
