// Unit test for the loud refusal of --headless (spec 2): the flag was
// retired in favor of headless-by-default with --headed as the override.
// Passing it to scan or purge must print one clear line naming --headed and
// exit non-zero without launching a browser.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const command of ["scan", "purge"]) {
  const result = spawnSync(process.execPath, ["src/cli.js", command, "--headless"], {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
  });

  const output = `${result.stdout || ""}${result.stderr || ""}`;
  assert.strictEqual(result.status, 1, `expected exit 1 for ${command} --headless, got ${result.status}; output: ${output}`);
  assert.ok(output.includes("--headed"), `expected the refusal line to name --headed, got: ${output}`);
  assert.ok(!/Launching|Chromium/i.test(output), `${command} --headless must not launch a browser, got: ${output}`);
}

console.log("PASS: --headless is refused loudly for scan and purge and no browser launches");
