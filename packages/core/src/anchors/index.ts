import { extractMarkdownAnchors, extractMarkdownTitle } from './markdown.js';
import { extractOpenApiAnchors, extractOpenApiTitle } from './openapi.js';

export type DocType = 'markdown' | 'openapi';

const EXTENSION_MAP: Record<string, DocType> = {
	'.md': 'markdown',
	'.markdown': 'markdown',
	'.yaml': 'openapi',
	'.yml': 'openapi',
	'.json': 'openapi'
};

export function getDocType(filePath: string): DocType | undefined {
	const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
	return EXTENSION_MAP[ext];
}

export function extractAnchors(content: string, docType: DocType): string[] {
	switch (docType) {
		case 'markdown':
			return extractMarkdownAnchors(content);
		case 'openapi':
			return extractOpenApiAnchors(content);
	}
}

export function extractTitle(content: string, docType: DocType): string | undefined {
	switch (docType) {
		case 'markdown':
			return extractMarkdownTitle(content);
		case 'openapi':
			return extractOpenApiTitle(content);
	}
}

export { extractMarkdownAnchors, extractMarkdownTitle } from './markdown.js';
export { extractOpenApiAnchors, extractOpenApiTitle } from './openapi.js';
