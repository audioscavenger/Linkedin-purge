/*
  Unit test for the help screen end state (spec 2, story 5): the parameter
  list shows --headed and never --headless, so a reader cannot pass a flag
  that does nothing. Spawned like the --reset-checkpoint prior art.
*/
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = spawnSync(process.execPath, ["src/cli.mjs", "help"], {
  cwd: root,
  encoding: "utf8",
  timeout: 10000,
});

const output = `${result.stdout || ""}${result.stderr || ""}`;
assert.strictEqual(
  result.status,
  0,
  `expected help to exit 0, got ${result.status}; output: ${output}`
);
assert.ok(
  output.includes("--headed"),
  `expected the parameter list to show --headed, got: ${output}`
);
assert.ok(
  !output.includes("--headless"),
  `help must never show --headless, got: ${output}`
);
console.log("PASS: help screen shows --headed and never --headless");
