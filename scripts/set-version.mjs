// Set one version across every published workspace package, so pnpm can
// rewrite their workspace:* links to matching versions at publish time.
// Usage: node scripts/set-version.mjs <version>
import { readFileSync, writeFileSync } from "node:fs";

const PUBLISHED = ["packages/core", "packages/cli", "packages/ui"];

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
	console.error("usage: node scripts/set-version.mjs <major.minor.patch[-pre]>");
	process.exit(1);
}

for (const dir of PUBLISHED) {
	const path = `${dir}/package.json`;
	const pkg = JSON.parse(readFileSync(path, "utf8"));
	pkg.version = version;
	writeFileSync(path, `${JSON.stringify(pkg, null, "\t")}\n`);
	console.log(`${pkg.name}@${version}`);
}
