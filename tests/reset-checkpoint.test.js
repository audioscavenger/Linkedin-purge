/*
  Unit test for the loud refusal of --reset-checkpoint (ticket 23):
  the flag was removed in 0.5.0; passing it must print one clear line
  saying so and exit non-zero without launching a browser.
*/
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = spawnSync(
  process.execPath,
  ["src/cli.js", "purge", "--reset-checkpoint"],
  {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
  }
);

const output = `${result.stdout || ""}${result.stderr || ""}`;
assert.strictEqual(
  result.status,
  1,
  `expected exit 1, got ${result.status}; output: ${output}`
);
assert.ok(
  output.includes("removed in 0.5.0"),
  `expected the removal line, got: ${output}`
);
assert.ok(
  !/Launching|Chromium/i.test(output),
  `browser must not launch, got: ${output}`
);
console.log(
  "PASS: --reset-checkpoint is refused loudly and no browser launches"
);
