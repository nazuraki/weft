import { command } from "cleye";
import { exitCodeFor, formatReport, runValidation } from "../validation.js";

export const checkCommand = command(
	{
		name: "check",
		help: {
			description: "Validate the graph and exit non-zero if any rule reports an error",
		},
		parameters: ["[root-dir]"],
		flags: {
			json: {
				type: Boolean,
				description: "Emit the result as JSON",
				default: false,
			},
		},
	},
	async (argv) => {
		const result = await runValidation(argv._.rootDir ?? process.cwd());
		console.log(formatReport(result, { json: argv.flags.json }));
		process.exitCode = exitCodeFor(result);
	}
);
