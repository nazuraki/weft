import { spawn } from "node:child_process";

export interface OpenCommand {
	command: string;
	args: string[];
}

/**
 * The platform's own "open this in the default browser" command. Each OS
 * ships one, so no dependency is needed to find a browser.
 */
export function openCommand(
	url: string,
	platform: NodeJS.Platform = process.platform
): OpenCommand {
	switch (platform) {
		case "darwin":
			return { command: "open", args: [url] };
		case "win32":
			// `start` is a cmd builtin; the empty string is the window title it
			// would otherwise take the (quoted) url for.
			return { command: "cmd", args: ["/c", "start", "", url] };
		default:
			return { command: "xdg-open", args: [url] };
	}
}

/**
 * Open a url in the default browser without waiting on it. Failing to open is
 * reported, never fatal: the server is up and the url is already printed.
 */
export function openBrowser(url: string, platform?: NodeJS.Platform): void {
	const { command, args } = openCommand(url, platform);
	const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
	child.on("error", (err) => {
		console.error(`Could not open a browser (${command}: ${err.message}) — open ${url} yourself.`);
	});
	child.unref();
}
