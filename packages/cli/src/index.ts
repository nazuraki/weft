#!/usr/bin/env node
import { cli } from "cleye";
import { analyzeCommand } from "./commands/analyze.js";
import { checkCommand } from "./commands/check.js";
import { indexCommand } from "./commands/index-cmd.js";
import { serveCommand } from "./commands/serve.js";

const argv = cli({
	name: "weft",
	version: "0.0.1",
	commands: [analyzeCommand, checkCommand, indexCommand, serveCommand],
});

// Show help if no command given
if (!argv.command) {
	argv.showHelp();
}
