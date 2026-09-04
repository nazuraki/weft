#!/usr/bin/env node
import { createRequire } from "node:module";
import { cli } from "cleye";
import { analyzeCommand } from "./commands/analyze.js";
import { checkCommand } from "./commands/check.js";
import { indexCommand } from "./commands/index-cmd.js";
import { serveCommand } from "./commands/serve.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const argv = cli({
	name: "weft",
	version,
	commands: [analyzeCommand, checkCommand, indexCommand, serveCommand],
});

// Show help if no command given
if (!argv.command) {
	argv.showHelp();
}
