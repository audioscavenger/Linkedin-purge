// Reports repo health state: check, test, and hook status.
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const results = [];

function run(label, fn) {
  try {
    const out = fn();
    results.push({ label, ok: true, detail: (out || "").trim().split("\n").slice(-1)[0] });
  } catch (e) {
    results.push({ label, ok: false, detail: e.message || String(e) });
  }
}

run("syntax check", () =>
  execFileSync(process.execPath, [path.join(root, "scripts/check-all.js")], { encoding: "utf8" })
);

run("unit tests", () =>
  execFileSync("node", [path.join(root, "tests/purge.test.js")], { encoding: "utf8" })
);

const hooksActive = fs.existsSync(path.join(root, ".husky/pre-commit"));
results.push({
  label: "pre-commit hook",
  ok: hooksActive,
  detail: hooksActive ? "active (.husky/pre-commit)" : "MISSING — run `npx husky install`",
});

const gitBranch = (() => {
  try {
    return execSync("git branch --show-current", { encoding: "utf8", cwd: root }).trim();
  } catch {
    return "unknown";
  }
})();

let clean = true;
for (const r of results) {
  const mark = r.ok ? "✓" : "✗";
  console.log(`${mark}  ${r.label.padEnd(20)}  ${r.detail}`);
  if (!r.ok) clean = false;
}

console.log(`\ngit branch: ${gitBranch}`);
process.exit(clean ? 0 : 1);
