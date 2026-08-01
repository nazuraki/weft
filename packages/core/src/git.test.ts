import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileHistory, lastCommitDates, parseGitLog } from "./git.js";

/** The NUL the log format writes before each commit's date. */
const MARK = String.fromCharCode(0);

/** A readable stand-in for an object id. */
const sha = (char: string) => char.repeat(40);
const ZERO = sha("0");

/** One `--raw` entry. A rename passes both paths. */
function change(status: string, oldBlob: string, newBlob: string, ...paths: string[]): string {
	return `:100644 100644 ${oldBlob} ${newBlob} ${status}\t${paths.join("\t")}`;
}

function commit(date: string, ...entries: string[]): string {
	return [`${MARK}${date}`, "", ...entries].join("\n");
}

/** Commits are written newest-first, as git emits them. */
function log(...commits: string[]): string {
	return `${commits.join("\n")}\n`;
}

const DAY = "2026-07-30T00:00:00Z";
const EARLIER = "2026-01-02T00:00:00Z";

describe("parseGitLog (dates)", () => {
	it("maps each path to the commit that touched it", () => {
		const { dates } = parseGitLog(
			log(
				commit(
					DAY,
					change("M", sha("a"), sha("b"), "README.md"),
					change("M", sha("c"), sha("d"), "guide.md")
				)
			)
		);

		expect(dates.get("README.md")).toBe(DAY);
		expect(dates.get("guide.md")).toBe(DAY);
	});

	it("keeps the most recent commit for a path changed more than once", () => {
		// git walks newest first, so the first commit naming a path wins.
		const { dates } = parseGitLog(
			log(
				commit(DAY, change("M", sha("b"), sha("c"), "guide.md")),
				commit(
					EARLIER,
					change("M", sha("a"), sha("b"), "guide.md"),
					change("A", ZERO, sha("e"), "old.md")
				)
			)
		);

		expect(dates.get("guide.md")).toBe(DAY);
		expect(dates.get("old.md")).toBe(EARLIER);
	});

	it("returns nothing for an empty log", () => {
		expect(parseGitLog("").dates.size).toBe(0);
	});

	it("ignores entries listed before any commit", () => {
		expect(parseGitLog(`${change("M", sha("a"), sha("b"), "stray.md")}\n`).dates.size).toBe(0);
	});

	it("reads a path that would look like a commit line under a printable marker", () => {
		// The marker is a NUL precisely so a document called "commit notes.md"
		// cannot be mistaken for one.
		const { dates } = parseGitLog(
			log(commit(DAY, change("M", sha("a"), sha("b"), "commit notes.md")))
		);

		expect(dates.get("commit notes.md")).toBe(DAY);
	});

	it("tolerates CRLF line endings", () => {
		const crlf = log(commit(DAY, change("M", sha("a"), sha("b"), "guide.md"))).replace(
			/\n/g,
			"\r\n"
		);

		expect(parseGitLog(crlf).dates.get("guide.md")).toBe(DAY);
	});

	it("keeps a path with a space in it whole", () => {
		const { dates } = parseGitLog(
			log(commit(DAY, change("M", sha("a"), sha("b"), "release notes/v2 draft.md")))
		);

		expect(dates.has("release notes/v2 draft.md")).toBe(true);
	});
});

describe("parseGitLog (blobs)", () => {
	it("records both sides of a change, so a path's whole history is present", () => {
		const { blobs } = parseGitLog(log(commit(DAY, change("M", sha("a"), sha("b"), "guide.md"))));

		expect([...(blobs.get("guide.md") ?? [])].sort()).toEqual([sha("a"), sha("b")]);
	});

	it("accumulates across commits", () => {
		const { blobs } = parseGitLog(
			log(
				commit(DAY, change("M", sha("b"), sha("c"), "guide.md")),
				commit(EARLIER, change("A", ZERO, sha("b"), "guide.md"))
			)
		);

		expect([...(blobs.get("guide.md") ?? [])].sort()).toEqual([sha("b"), sha("c")]);
	});

	it("ignores the all-zero id an add or a delete writes", () => {
		const { blobs } = parseGitLog(log(commit(DAY, change("A", ZERO, sha("a"), "guide.md"))));

		expect([...(blobs.get("guide.md") ?? [])]).toEqual([sha("a")]);
	});

	it("lets two paths that held one blob be told apart from two that never did", () => {
		const { blobs } = parseGitLog(
			log(
				commit(
					DAY,
					change("M", sha("a"), sha("b"), "copy.md"),
					change("M", sha("a"), sha("c"), "original.md")
				),
				commit(EARLIER, change("M", sha("z"), sha("y"), "unrelated.md"))
			)
		);

		const copy = blobs.get("copy.md") ?? new Set();
		const original = blobs.get("original.md") ?? new Set();
		const unrelated = blobs.get("unrelated.md") ?? new Set();

		expect([...copy].filter((b) => original.has(b))).toEqual([sha("a")]);
		expect([...copy].filter((b) => unrelated.has(b))).toEqual([]);
	});
});

describe("parseGitLog (renames)", () => {
	it("records where a path moved to", () => {
		const { renames } = parseGitLog(
			log(commit(DAY, change("R100", sha("a"), sha("a"), "old.md", "new.md")))
		);

		expect(renames.get("old.md")).toBe("new.md");
	});

	it("collapses a chain of renames to the current name", () => {
		// Newest first: b -> c is seen before a -> b, so a resolves straight to c.
		const { renames } = parseGitLog(
			log(
				commit(DAY, change("R100", sha("b"), sha("b"), "b.md", "c.md")),
				commit(EARLIER, change("R100", sha("a"), sha("a"), "a.md", "b.md"))
			)
		);

		expect(renames.get("a.md")).toBe("c.md");
		expect(renames.get("b.md")).toBe("c.md");
	});

	it("files a renamed path's earlier blobs under the name it goes by now", () => {
		// Without this a moved document loses everything it was before the move,
		// which is exactly the history divergence detection needs.
		const { blobs } = parseGitLog(
			log(
				commit(DAY, change("R100", sha("b"), sha("b"), "old.md", "new.md")),
				commit(EARLIER, change("A", ZERO, sha("b"), "old.md"))
			)
		);

		expect(blobs.get("new.md")?.has(sha("b"))).toBe(true);
		expect(blobs.has("old.md")).toBe(false);
	});

	it("dates a renamed path under its current name", () => {
		const { dates } = parseGitLog(
			log(
				commit(DAY, change("R100", sha("b"), sha("b"), "old.md", "new.md")),
				commit(EARLIER, change("A", ZERO, sha("b"), "old.md"))
			)
		);

		expect(dates.get("new.md")).toBe(DAY);
		expect(dates.has("old.md")).toBe(false);
	});
});

describe("fileHistory", () => {
	let repo: string;

	beforeAll(() => {
		repo = mkdtempSync(join(tmpdir(), "weft-git-"));
		const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });

		git("init", "-q");
		git("config", "user.email", "test@example.com");
		git("config", "user.name", "Test");
		git("config", "commit.gpgsign", "false");

		// Dates are set explicitly: two commits made a moment apart would
		// otherwise share a timestamp and prove nothing about which is newer.
		writeFileSync(join(repo, "guide.md"), "# Guide\n");
		git("add", "guide.md");
		git("commit", "-q", "-m", "add guide", "--date", "2026-01-02T00:00:00+00:00");

		writeFileSync(join(repo, "spec.md"), "# Spec\n");
		git("add", "spec.md");
		git("commit", "-q", "-m", "add spec", "--date", "2026-07-30T00:00:00+00:00");

		// A real rename, so rename detection is exercised rather than simulated.
		git("mv", "guide.md", "handbook.md");
		git("commit", "-q", "-m", "rename guide", "--date", "2026-07-31T00:00:00+00:00");
	});

	afterAll(() => rmSync(repo, { recursive: true, force: true }));

	it("dates every committed file", async () => {
		const { dates } = await fileHistory(repo);

		expect(dates.has("handbook.md")).toBe(true);
		expect(dates.has("spec.md")).toBe(true);
	});

	it("gives a date that parses as a real instant", async () => {
		const { dates } = await fileHistory(repo);

		expect(Number.isNaN(Date.parse(dates.get("spec.md") as string))).toBe(false);
	});

	it("has no date for an uncommitted file", async () => {
		writeFileSync(join(repo, "draft.md"), "# Draft\n");

		expect((await fileHistory(repo)).dates.has("draft.md")).toBe(false);
	});

	it("records a real blob for every tracked file", async () => {
		const { blobs } = await fileHistory(repo);

		expect(blobs.get("spec.md")?.size).toBeGreaterThan(0);
		for (const blob of blobs.get("spec.md") ?? []) expect(blob).toMatch(/^[0-9a-f]{40}$/);
	});

	it("detects a rename git performed", async () => {
		const { renames } = await fileHistory(repo);

		expect(renames.get("guide.md")).toBe("handbook.md");
	});

	it("carries a renamed file's earlier history onto its new name", async () => {
		const { blobs, dates } = await fileHistory(repo);

		// The file existed as guide.md before the move; that history belongs to
		// handbook.md now, and nothing should still be filed under the old name.
		expect(blobs.has("guide.md")).toBe(false);
		expect(dates.has("guide.md")).toBe(false);
		expect(blobs.get("handbook.md")?.size).toBeGreaterThan(0);
	});

	it("returns an empty history outside a repository rather than failing", async () => {
		// A modification date is metadata worth having, never a reason to fail an
		// index — a docs set unpacked from a tarball still has to build.
		const loose = mkdtempSync(join(tmpdir(), "weft-nogit-"));
		try {
			const history = await fileHistory(loose);
			expect(history.dates.size).toBe(0);
			expect(history.blobs.size).toBe(0);
			expect(history.renames.size).toBe(0);
		} finally {
			rmSync(loose, { recursive: true, force: true });
		}
	});

	it("returns an empty history for a directory that does not exist", async () => {
		expect((await fileHistory(join(repo, "nope"))).dates.size).toBe(0);
	});
});

describe("lastCommitDates", () => {
	it("is the dates half of a file history", async () => {
		const loose = mkdtempSync(join(tmpdir(), "weft-nogit-"));
		try {
			expect(await lastCommitDates(loose)).toEqual(new Map());
		} finally {
			rmSync(loose, { recursive: true, force: true });
		}
	});
});
