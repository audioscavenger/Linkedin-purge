// Directory-driven test runner.
// Finds and runs all files matching tests/*.test.js.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = path.join(root, "tests");

function findTests(dir) {
  const out = [];

  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      out.push(...findTests(full));
    } else if (entry.endsWith(".test.mjs")) {
      out.push(full);
    }
  }

  return out;
}

const testFiles = findTests(testsDir).toSorted();

if (process.argv.includes("--list")) {
  console.log(`Test files found (${testFiles.length}):`);

  for (const f of testFiles) {
    console.log(`  - ${path.relative(root, f)}`);
  }

  process.exit(0);
}

console.log(`Running ${testFiles.length} test files from tests/:`);

for (const f of testFiles) {
  console.log(`  - ${path.relative(root, f)}`);
}

let ok = true;

for (const file of testFiles) {
  const rel = path.relative(root, file);

  try {
    execFileSync(process.execPath, [file], { stdio: "inherit" });
  } catch (e) {
    console.error(`FAIL: ${rel}`);
    ok = false;
    break;
  }
}

process.exit(ok ? 0 : 1);
