import { describe, expect, it } from "vitest";
import { openCommand } from "./open-browser.js";

const URL = "http://localhost:7777";

describe("openCommand", () => {
	it("uses `open` on macOS", () => {
		expect(openCommand(URL, "darwin")).toEqual({ command: "open", args: [URL] });
	});

	it("uses cmd's `start` on Windows, with an explicit empty title", () => {
		expect(openCommand(URL, "win32")).toEqual({ command: "cmd", args: ["/c", "start", "", URL] });
	});

	it("uses xdg-open everywhere else", () => {
		expect(openCommand(URL, "linux")).toEqual({ command: "xdg-open", args: [URL] });
		expect(openCommand(URL, "freebsd")).toEqual({ command: "xdg-open", args: [URL] });
	});
});
