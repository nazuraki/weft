import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Resolve a GitHub token: `GH_TOKEN`, then `GITHUB_TOKEN`, then `gh auth token`
 * when the GitHub CLI is on PATH. No credential store of our own — anyone with
 * a private repo to fetch already has one of these.
 */
export async function resolveToken(
	env: NodeJS.ProcessEnv = process.env
): Promise<string | undefined> {
	const fromEnv = env.GH_TOKEN?.trim() || env.GITHUB_TOKEN?.trim();
	if (fromEnv) return fromEnv;
	try {
		const { stdout } = await run("gh", ["auth", "token"], { windowsHide: true });
		return stdout.trim() || undefined;
	} catch {
		return undefined;
	}
}

/**
 * Environment that hands git an Authorization header for github.com.
 *
 * Passed as `GIT_CONFIG_*` variables rather than `-c` arguments or a rewritten
 * remote URL, so the token never lands in a process listing or in the cached
 * clone's `.git/config`.
 */
export function gitAuthEnv(token: string | undefined): NodeJS.ProcessEnv {
	if (!token) return {};
	const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
	return {
		GIT_CONFIG_COUNT: "1",
		GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
		GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
	};
}
