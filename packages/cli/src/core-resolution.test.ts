import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The CLI runs under plain Node (no Vite), so @weft/core must resolve to
// built JavaScript, not TypeScript source. See issue #10.
describe("@weft/core resolution for plain Node", () => {
	const require = createRequire(import.meta.url);

	it("resolves to built output, not TypeScript source", () => {
		const resolved = require.resolve("@weft/core");
		expect(resolved).toMatch(/dist[\\/]index\.js$/);
		expect(existsSync(resolved)).toBe(true);
	});

	it("imports successfully under plain Node", () => {
		const stdout = execFileSync(
			process.execPath,
			["--input-type=module", "-e", "await import('@weft/core'); console.log('ok');"],
			{ cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" }
		);
		expect(stdout.trim()).toBe("ok");
	});
});
