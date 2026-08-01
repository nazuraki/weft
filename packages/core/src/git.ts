import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Marks a date line in the log output.
 *
 * A NUL, because it is the one byte a path cannot contain: with a printable
 * prefix, a document called `commit notes.md` would be read as a date.
 */
const DATE_MARK = String.fromCharCode(0);

/** History can be long, and a truncated log would silently lose dates. */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/**
 * Read `git log --name-only` output as a map of path to the date it last
 * changed.
 *
 * Split from the subprocess so the parse is testable without a repository.
 * Paths arrive relative to the directory the log was run in, with forward
 * slashes on every platform.
 */
export function parseGitLog(output: string): Map<string, string> {
	const dates = new Map<string, string>();
	let date: string | undefined;

	for (const line of output.split("\n")) {
		const text = line.replace(/\r$/, "");
		if (!text) continue;

		if (text.startsWith(DATE_MARK)) {
			date = text.slice(DATE_MARK.length);
			continue;
		}

		// git log walks newest first, so the first commit naming a path is the
		// one that last touched it.
		if (date && !dates.has(text)) dates.set(text, date);
	}

	return dates;
}

/**
 * When each file under `dir` was last committed, keyed by path relative to it.
 *
 * One history walk per docs root rather than a `git log` per file, since the
 * indexer wants a date for every document it reads. Anything that stops git
 * answering — no repository, no git on PATH, a directory outside the work tree —
 * yields no dates rather than an error: a modification date is metadata worth
 * having, never a reason to fail an index.
 */
export async function lastCommitDates(dir: string): Promise<Map<string, string>> {
	try {
		const { stdout } = await run(
			"git",
			[
				// Without this, a path with a non-ASCII character comes back quoted
				// and escaped, and would never match the file it names.
				"-c",
				"core.quotepath=false",
				"log",
				// Author date rather than committer date: a rebase or a cherry-pick
				// rewrites the latter to the moment it ran, which would report every
				// document on the branch as having changed today.
				"--format=%x00%aI",
				"--name-only",
				// Paths relative to this directory, and only the ones under it.
				"--relative",
				"--",
				".",
			],
			{ cwd: dir, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true }
		);
		return parseGitLog(stdout);
	} catch {
		return new Map();
	}
}
