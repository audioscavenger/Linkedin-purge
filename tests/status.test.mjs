// Unit tests for the status command.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";
import { runStatus } from "../src/cli/status.mjs";

let tmp;

async function captureConsole(fn) {
  const lines = [];
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...a) => lines.push(a.join(" "));
  console.warn = (...a) => lines.push(a.join(" "));
  let result;
  let error;

  try {
    result = await fn();
  } catch (e) {
    error = e;
  }

  console.log = origLog;
  console.warn = origWarn;

  if (error) throw error;

  return { lines, output: lines.join("\n"), result };
}

function envelope(items) {
  return {
    type: "likes",
    count: items.length,
    keys: items.map((i) => i.key),
    items,
    scannedAt: "2026-10-26T07:49:00.000Z",
    steps: 1,
    complete: true,
  };
}

async function testCounts() {
  const dir = fs.mkdtempSync(path.join(tmp, "status-counts-"));

  const data = envelope([
    { key: "reaction:1", cardId: "card-1", status: "deleted" },
    { key: "reaction:2", cardId: "card-2", status: "failed" },
    { key: "reaction:3", cardId: "card-3", status: "not-found" },
    { key: "reaction:4", cardId: "card-4", status: "todo" },
    { key: "reaction:5", cardId: "card-5", status: "no-op" },
  ]);

  fs.writeFileSync(
    path.join(dir, "scan-likes.json"),
    JSON.stringify(data, null, 2)
  );

  const { output } = await captureConsole(() =>
    runStatus(["--data-dir", dir, "--type", "likes"])
  );

  assert.ok(output.includes("likes"), "prints the type");
  assert.ok(/deleted\D*1/.test(output), "prints deleted count");
  assert.ok(/failed\D*1/.test(output), "prints failed count");
  assert.ok(/not.?found\D*1/i.test(output), "prints not-found count");
  assert.ok(/todo\D*1/.test(output), "prints todo count");
  assert.ok(/no-op\D*1/.test(output), "prints no-op count");
  console.log("PASS: status counts");
}

async function testMissingEnvelope() {
  const dir = fs.mkdtempSync(path.join(tmp, "status-missing-"));

  const { output } = await captureConsole(() =>
    runStatus(["--data-dir", dir, "--type", "likes"])
  );

  assert.ok(
    output.includes("no scan yet"),
    "missing envelope reported as no scan yet"
  );
  console.log("PASS: status missing envelope");
}

async function testNoCheckpointRead() {
  const dir = fs.mkdtempSync(path.join(tmp, "status-nocheckpoint-"));
  fs.writeFileSync(
    path.join(dir, "checkpoint-likes.json"),
    "{ this is not valid json"
  );

  const data = envelope([
    { key: "reaction:1", cardId: "card-1", status: "deleted" },
  ]);

  fs.writeFileSync(
    path.join(dir, "scan-likes.json"),
    JSON.stringify(data, null, 2)
  );

  const { output } = await captureConsole(() =>
    runStatus(["--data-dir", dir, "--type", "likes"])
  );

  assert.ok(
    output.includes("deleted"),
    "status reads envelope, not checkpoint"
  );
  console.log("PASS: status does not read checkpoint");
}

const tests = [testCounts, testMissingEnvelope, testNoCheckpointRead];

async function main() {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lp-status-"));
  let failed = 0;

  try {
    for (const fn of tests) {
      try {
        await fn();
      } catch (e) {
        console.error(`FAIL: ${fn.name} - ${e.message}`);
        failed++;
      }
    }
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (e) {
      // Best effort cleanup; ignore errors.
      void e;
    }
  }

  const passed = tests.length - failed;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
