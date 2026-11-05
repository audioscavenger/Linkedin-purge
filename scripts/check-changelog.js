// Check that package.json's version has a corresponding CHANGELOG.md entry.
// Runs in pre-commit so a version bump without a changelog entry fails before
// the commit is created.
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const version = pkg.version;
const changelog = fs.readFileSync("CHANGELOG.md", "utf8");

if (!changelog.includes(`v${version}`)) {
  console.error(
    `CHANGELOG.md has no entry for version ${version}. ` +
      `Add a "v${version}" entry under "Released" before committing.`
  );
  process.exit(1);
}

console.log(`CHANGELOG.md has entry for v${version}`);
