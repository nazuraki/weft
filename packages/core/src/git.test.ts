import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lastCommitDates, parseGitLog } from "./git.js";

/** The NUL the log format writes before each date. */
const MARK = String.fromCharCode(0);

function log(...entries: [date: string, ...paths: string[]][]): string {
	return `${entries.map(([date, ...paths]) => [`${MARK}${date}`, "", ...paths].join("\n")).join("\n\n")}\n`;
}

describe("parseGitLog", () => {
	it("maps each path to the commit that touched it", () => {
		const dates = parseGitLog(log(["2026-07-30T15:04:55+01:00", "README.md", "guide.md"]));

		expect(dates.get("README.md")).toBe("2026-07-30T15:04:55+01:00");
		expect(dates.get("guide.md")).toBe("2026-07-30T15:04:55+01:00");
	});

	it("keeps the most recent commit for a path changed more than once", () => {
		// git walks newest first, so the first commit naming a path wins.
		const dates = parseGitLog(
			log(["2026-07-30T00:00:00Z", "guide.md"], ["2026-01-02T00:00:00Z", "guide.md", "old.md"])
		);

		expect(dates.get("guide.md")).toBe("2026-07-30T00:00:00Z");
		expect(dates.get("old.md")).toBe("2026-01-02T00:00:00Z");
	});

	it("returns nothing for an empty log", () => {
		expect(parseGitLog("")).toEqual(new Map());
	});

	it("ignores paths listed before any date", () => {
		expect(parseGitLog("stray.md\n")).toEqual(new Map());
	});

	it("reads a path that would look like a date line under a printable marker", () => {
		// The marker is a NUL precisely so a document called "commit notes.md"
		// cannot be mistaken for one.
		const dates = parseGitLog(log(["2026-07-30T00:00:00Z", "commit notes.md"]));

		expect(dates.get("commit notes.md")).toBe("2026-07-30T00:00:00Z");
	});

	it("tolerates CRLF line endings", () => {
		const crlf = log(["2026-07-30T00:00:00Z", "guide.md"]).replace(/\n/g, "\r\n");

		expect(parseGitLog(crlf).get("guide.md")).toBe("2026-07-30T00:00:00Z");
	});

	it("keeps a path with a space in it whole", () => {
		const dates = parseGitLog(log(["2026-07-30T00:00:00Z", "release notes/v2 draft.md"]));

		expect(dates.has("release notes/v2 draft.md")).toBe(true);
	});
});

describe("lastCommitDates", () => {
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
	});

	afterAll(() => rmSync(repo, { recursive: true, force: true }));

	it("dates every committed file", async () => {
		const dates = await lastCommitDates(repo);

		expect(dates.has("guide.md")).toBe(true);
		expect(dates.has("spec.md")).toBe(true);
	});

	it("gives a date that parses as a real instant", async () => {
		const dates = await lastCommitDates(repo);

		expect(Number.isNaN(Date.parse(dates.get("guide.md") as string))).toBe(false);
	});

	it("dates a file by its own commit rather than the newest one", async () => {
		const dates = await lastCommitDates(repo);

		expect(Date.parse(dates.get("guide.md") as string)).toBeLessThan(
			Date.parse(dates.get("spec.md") as string)
		);
	});

	it("has no date for an uncommitted file", async () => {
		writeFileSync(join(repo, "draft.md"), "# Draft\n");

		expect((await lastCommitDates(repo)).has("draft.md")).toBe(false);
	});

	it("returns no dates outside a repository rather than failing", async () => {
		// A modification date is metadata worth having, never a reason to fail an
		// index — a docs set unpacked from a tarball still has to build.
		const loose = mkdtempSync(join(tmpdir(), "weft-nogit-"));
		try {
			expect(await lastCommitDates(loose)).toEqual(new Map());
		} finally {
			rmSync(loose, { recursive: true, force: true });
		}
	});

	it("returns no dates for a directory that does not exist", async () => {
		expect(await lastCommitDates(join(repo, "nope"))).toEqual(new Map());
	});
});
