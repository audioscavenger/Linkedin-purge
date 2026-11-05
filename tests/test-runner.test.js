// Tests the directory-driven test runner (test-runner.js).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 1. Runner runs tests/*.test.js successfully using programmatic import or direct execution
const runnerPath = path.join(root, "scripts/test-runner.js");
const out = execFileSync(process.execPath, [runnerPath, "--list"], { encoding: "utf8" });
assert.ok(out.includes("activity-loader.test.js"), "Runner should list test files");

// 2. Dynamic addition of a test file under tests/ is picked up automatically
const zzzPath = path.join(root, "tests/zzz.test.js");
fs.writeFileSync(zzzPath, `import assert from 'node:assert';\nassert.strictEqual(1, 1);\nconsole.log('zzz test ran successfully');\n`);

try {
  const outWithZzz = execFileSync(process.execPath, [runnerPath, "--list"], { encoding: "utf8" });
  assert.ok(outWithZzz.includes("zzz.test.js"), "Runner should pick up newly added tests/zzz.test.js");
} finally {
  if (fs.existsSync(zzzPath)) fs.unlinkSync(zzzPath);
}

console.log("test-runner.test.js passed successfully!");
