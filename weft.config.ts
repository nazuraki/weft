import { defineConfig } from '@weft/core';

export default defineConfig({
	docsDir: 'docs',
	entryPoint: 'docs/README.md',
	ignore: ['**/node_modules/**', '**/dist/**']
});
