import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Marks a commit line in the log output.
 *
 * A NUL, because it is the one byte a path cannot contain: with a printable
 * prefix, a document called `commit notes.md` would be read as a date.
 */
const DATE_MARK = String.fromCharCode(0);

/** History can be long, and a truncated log would silently lose dates. */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/** An all-zero object id, which `--raw` writes for the missing side of an add or a delete. */
const ABSENT_BLOB = /^0+$/;

/** What a single history walk yields. Empty throughout when git cannot answer. */
export interface FileHistory {
	/** When each path last changed, as an ISO 8601 timestamp with offset. */
	dates: Map<string, string>;
	/**
	 * Every blob a path has ever held, under the name it goes by now.
	 *
	 * Two paths whose sets intersect held identical content at some point, which
	 * is what makes divergence detectable after the copies stop matching — the
	 * moment a plain hash comparison goes quiet.
	 */
	blobs: Map<string, Set<string>>;
	/**
	 * Where a path moved to, resolved through the whole chain: a file renamed
	 * twice maps straight to its current name rather than to the intermediate.
	 */
	renames: Map<string, string>;
}

/**
 * Read `git log --raw` output into a file history.
 *
 * Split from the subprocess so the parse is testable without a repository.
 * Paths arrive relative to the directory the log was run in, with forward
 * slashes on every platform.
 *
 * The walk is newest-first, which is what makes the rename handling work: by
 * the time an older commit mentions a path under its former name, the rename
 * that renamed it has already been seen, so its blobs can be filed under the
 * name the path goes by today.
 */
export function parseGitLog(output: string): FileHistory {
	const dates = new Map<string, string>();
	const blobs = new Map<string, Set<string>>();
	const renames = new Map<string, string>();
	let date: string | undefined;

	/** The name a path goes by now, following any renames already seen. */
	const currentName = (path: string): string => renames.get(path) ?? path;

	const record = (path: string, ...candidates: string[]) => {
		if (!date) return;
		const name = currentName(path);

		// git walks newest first, so the first commit naming a path is the one
		// that last touched it.
		if (!dates.has(name)) dates.set(name, date);

		let held = blobs.get(name);
		if (!held) {
			held = new Set<string>();
			blobs.set(name, held);
		}
		for (const blob of candidates) {
			if (blob && !ABSENT_BLOB.test(blob)) held.add(blob);
		}
	};

	for (const line of output.split("\n")) {
		const text = line.replace(/\r$/, "");
		if (!text) continue;

		if (text.startsWith(DATE_MARK)) {
			date = text.slice(DATE_MARK.length);
			continue;
		}

		// Anything else is a --raw entry:
		//   :<mode> <mode> <old blob> <new blob> <status>\t<path>
		// with a second path appended for a rename.
		if (!text.startsWith(":")) continue;

		const fields = text.split("\t");
		const [, , oldBlob, newBlob] = fields[0].split(" ");
		const from = fields[1];
		const to = fields[2];
		if (!from) continue;

		if (to) {
			// Note the rename before recording anything, so every older commit
			// still to come under the source name files its blobs against the
			// destination. That is what carries a document's history across a
			// rename instead of stranding it under a path nothing points at.
			// Resolving the destination first collapses a chain of renames.
			renames.set(from, currentName(to));
		}

		record(to ?? from, oldBlob, newBlob);
	}

	return { dates, blobs, renames };
}

/**
 * How much of a walk to pay for.
 *
 * Rename detection compares file content across every commit, and dates do not
 * need it: a rename names its destination path whether or not git pairs it with
 * the source, so the newest commit touching a path is the same commit either
 * way. `"dates"` skips `-M` and leaves {@link FileHistory.renames} empty;
 * `"full"` pays it for the renames and cross-rename blob attribution that
 * validation wants.
 */
export type HistoryDepth = "dates" | "full";

/**
 * What git knows about the files under `dir`, keyed by path relative to it.
 *
 * One history walk rather than a command per file or per question: the indexer
 * wants a date for every document, and validation wants blobs and renames for
 * all of them at once. Anything that stops git answering — no repository, no git
 * on PATH, a directory outside the work tree — yields an empty history rather
 * than an error, since none of this is worth failing an index over.
 */
export async function fileHistory(dir: string, depth: HistoryDepth = "full"): Promise<FileHistory> {
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
				// Blob ids in full rather than abbreviated so two paths that held
				// one blob compare equal.
				"--raw",
				"--no-abbrev",
				// `--no-renames` rather than merely omitting `-M`: `diff.renames`
				// defaults on, so a dates walk has to opt out explicitly to skip
				// the content comparison it is trying not to pay for.
				...(depth === "full" ? ["-M"] : ["--no-renames"]),
				// Paths relative to this directory, and only the ones under it.
				"--relative",
				"--",
				".",
			],
			{ cwd: dir, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true }
		);
		return parseGitLog(stdout);
	} catch {
		return { dates: new Map(), blobs: new Map(), renames: new Map() };
	}
}

/** When each file under `dir` was last committed. A view of {@link fileHistory}. */
export async function lastCommitDates(dir: string): Promise<Map<string, string>> {
	return (await fileHistory(dir, "dates")).dates;
}
