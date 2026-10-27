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

// Run exactly the test set that `npm run test` runs, read from package.json so
// a newly registered test file cannot be silently skipped here.
const testCommands = String(
  JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts.test || ""
)
  .split("&&")
  .map((cmd) => cmd.trim())
  .filter(Boolean);

run("unit tests", () =>
  testCommands
    .map((cmd) => execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }))
    .join("\n")
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
