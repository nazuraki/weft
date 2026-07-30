import { defaultRegistry } from "@weft/core";
import { command } from "cleye";
import { formatReport, formatRules, runValidation } from "../validation.js";

export const analyzeCommand = command(
	{
		name: "analyze",
		help: {
			description: "Run every validation rule over the graph and report the results",
		},
		parameters: ["[root-dir]"],
		flags: {
			json: {
				type: Boolean,
				description: "Emit the result as JSON",
				default: false,
			},
			listRules: {
				type: Boolean,
				description: "List the registered rules and their default severities, then exit",
				default: false,
			},
		},
	},
	async (argv) => {
		if (argv.flags.listRules) {
			console.log(formatRules(defaultRegistry()));
			return;
		}

		const result = await runValidation(argv._.rootDir ?? process.cwd());
		console.log(formatReport(result, { json: argv.flags.json }));
		// Reporting only — `weft check` is the command that fails a build.
	}
);
