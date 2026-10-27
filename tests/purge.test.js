// Unit tests for PurgeRunner using in-memory adapters (no browser/FS/TTY),
// plus one writer-seam test against the real ReporterAdapter (temp dir).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PurgeRunner, PageAdapter, CheckpointAdapter, ReporterAdapter, ConfirmAdapter } from "../src/purge.js";
// The canonical Report Entry field set, named once in the module that owns
// the entry: import it here instead of re-listing the six names.
import { REPORT_ENTRY_FIELDS } from "../src/purge/adapters/reporter-adapter.js";

class FakePageAdapter {
  constructor({ keys = [], deleteResult = { ok: false, key: null, skip: false } } = {}) {
    this.keys = keys;
    this.deleteResult = deleteResult;
  }
  async collectKeys() { return [...this.keys]; }
  // Mirrors the in-page contract: a plain membership check over the
  // eligible list the runner computes and hands over. No skip/allowed logic here.
  async deleteFirstEligible(eligibleKeys) {
    const eligibleSet = new Set(eligibleKeys || []);
    const nextKey = this.keys.find(k => eligibleSet.has(k));
    if (!nextKey) return { ok: false, key: null, skip: false, error: "no eligible item" };
    return { ok: true, key: nextKey, state: "no reaction", author: "Test Author", postHref: "/feed/update/1", dateTime: "2026-01-01T00:00:00Z" };
  }
  async waitForTimeout(ms) { return Promise.resolve(); }
}

class FakeCheckpointAdapter {
  constructor() { this.processed = new Set(); this.saved = 0; }
  async load() { return { processed: this.processed, file: "fake" }; }
  async has(key) { return this.processed.has(key); }
  async add(key) { this.processed.add(key); }
  async save() { this.saved++; }
  async reset() { this.processed.clear(); }
}

// Fake stands in at the runner seam, so it keeps the hand-off shape as-is:
// the runner's Purge Item fields and nothing more (no ts, no normalization).
// The Report Entry construction is the real writer's job, tested below.
class FakeReporterAdapter {
  constructor() { this.items = []; }
  async open(type) { this.type = type; this.items = []; this.opened = true; }
  async write(item) { this.items.push(item); }
  async close() { return "fake-report.json"; }
}

class FakeConfirmAdapter {
  constructor(answer = true) { this.answer = answer; }
  async confirm(message) { return this.answer; }
}

// Basic tests demonstrating in-memory adapter pattern
async function testHappyPath() {
  const page = new FakePageAdapter({ keys: ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9", "k10"] });
  const cp = new FakeCheckpointAdapter();
  const reporter = new FakeReporterAdapter();
  const confirm = new FakeConfirmAdapter(true);

  const runner = new PurgeRunner({ pageAdapter: page, checkpointAdapter: cp, reporterAdapter: reporter, confirmAdapter: confirm });
  const result = await runner.run({ type: "likes", timeoutMs: 3600000, batchSize: 5 });

  if (result.deleted !== 10) throw new Error(`Expected deleted=10, got ${result.deleted}`);
  console.log("PASS: happy path (10 items deleted)");
}

// Verify that inputKeys restricts deletion to only the keys in the input set.
async function testInputKeysFilter() {
  const page = new FakePageAdapter({ keys: ["k1", "k2", "k3", "k4", "k5"] });
  const cp = new FakeCheckpointAdapter();
  const reporter = new FakeReporterAdapter();
  const confirm = new FakeConfirmAdapter(true);

  const runner = new PurgeRunner({ pageAdapter: page, checkpointAdapter: cp, reporterAdapter: reporter, confirmAdapter: confirm });
  // Only k2 and k4 should be deleted (inputKeys filter)
  const result = await runner.run({ type: "likes", timeoutMs: 3600000, batchSize: 5, inputKeys: ["k2", "k4"] });

  const deletedKeys = reporter.items.map((it) => it.key).sort();
  if (deletedKeys.length !== 2) throw new Error(`Expected 2 deleted, got ${deletedKeys.length}`);
  if (deletedKeys[0] !== "k2" || deletedKeys[1] !== "k4") {
    throw new Error(`Expected [k2, k4], got [${deletedKeys.join(", ")}]`);
  }
  console.log("PASS: inputKeys filter (only k2, k4 deleted)");
}

// Resume never re-deletes: a checkpoint-processed key is NOT deleted even
// when present in the input set, while an input-only key IS deleted. The
// exclusion happens in the runner's eligible list; the fake just does membership.
async function testCheckpointNotRedeleted() {
  const page = new FakePageAdapter({ keys: ["k1", "k2"] });
  const cp = new FakeCheckpointAdapter();
  cp.processed.add("k1"); // already purged by a previous run
  const reporter = new FakeReporterAdapter();
  const confirm = new FakeConfirmAdapter(true);

  const runner = new PurgeRunner({ pageAdapter: page, checkpointAdapter: cp, reporterAdapter: reporter, confirmAdapter: confirm });
  // k1 is in the input set but checkpoint-processed; only k2 is eligible.
  const result = await runner.run({ type: "likes", timeoutMs: 3600000, batchSize: 5, inputKeys: ["k1", "k2"] });

  const deletedKeys = reporter.items.map((it) => it.key).sort();
  if (result.deleted !== 1) throw new Error(`Expected 1 deleted, got ${result.deleted}`);
  if (deletedKeys.length !== 1 || deletedKeys[0] !== "k2") {
    throw new Error(`Expected [k2] deleted (k1 checkpoint-processed), got [${deletedKeys.join(", ")}]`);
  }
  console.log("PASS: resume never re-deletes (checkpoint key skipped, input-only key deleted)");
}

async function testConfirmationAbort() {
  const page = new FakePageAdapter({ keys: ["k1"] });
  const cp = new FakeCheckpointAdapter();
  const reporter = new FakeReporterAdapter();
  const confirm = new FakeConfirmAdapter(false);

  const runner = new PurgeRunner({ pageAdapter: page, checkpointAdapter: cp, reporterAdapter: reporter, confirmAdapter: confirm });
  const result = await runner.run({ type: "likes", timeoutMs: 3600000 });

  if (result.deleted !== 0) throw new Error(`Expected deleted=0 (aborted), got ${result.deleted}`);
  console.log("PASS: confirmation abort");
}

// Writer seam: the real ReporterAdapter owns the Report Entry. It stamps its
// own ts, normalizes absent fields to null, and always writes the glossary's
// canonical field set - so a partially present item still yields all six
// fields, and a caller-supplied ts is not what lands in the report.
async function testReporterOwnsEntry() {
  // Unique temp dir under the OS temp root (no machine-specific paths);
  // created fresh by mkdtemp and cleaned up in the finally below.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-report-entry-test-"));
  const bogusTs = "1970-01-01T00:00:00.000Z"; // caller's own stamp: never written
  const reporter = new ReporterAdapter({ dataDir: dir });
  try {
    await reporter.open("likes");
    await reporter.write({
      key: "k1",
      state: "no reaction",
      // author, postHref, dateTime intentionally absent
      ts: bogusTs,
    });
    await reporter.write({ key: "k2" }); // everything else absent
    const filePath = await reporter.close();

    const report = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (report.items.length !== 2) throw new Error(`Expected 2 entries, got ${report.items.length}`);

    // Expected field set imported from the reporter (the entry's owner), so
    // it is named in exactly one module.
    const canonical = [...REPORT_ENTRY_FIELDS].sort();
    for (const entry of report.items) {
      const fields = Object.keys(entry).sort();
      if (JSON.stringify(fields) !== JSON.stringify(canonical)) {
        throw new Error(`Entry does not carry exactly the canonical field set: [${fields.join(", ")}]`);
      }
    }

    const [e1, e2] = report.items;
    if (e1.key !== "k1" || e1.state !== "no reaction") throw new Error("Present item fields not preserved");
    if (e1.author !== null || e1.postHref !== null || e1.dateTime !== null) {
      throw new Error("Absent item fields not normalized to null");
    }
    if (e1.ts === bogusTs) throw new Error("Caller-supplied ts was written; reporter must stamp its own");
    if (isNaN(Date.parse(e1.ts))) throw new Error(`ts is not a valid timestamp: ${e1.ts}`);

    if (e2.state !== null || e2.author !== null || e2.postHref !== null || e2.dateTime !== null) {
      throw new Error("Fully absent item fields not normalized to null");
    }
    if (e2.ts === bogusTs || isNaN(Date.parse(e2.ts))) throw new Error("ts is not the reporter's own stamp");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log("PASS: reporter owns the Report Entry (canonical fields, writer-stamped ts)");
}

const tests = { testHappyPath, testInputKeysFilter, testCheckpointNotRedeleted, testConfirmationAbort, testReporterOwnsEntry };

async function main() {
  let passed = 0;
  let failed = 0;

  for (const [name, fn] of Object.entries(tests)) {
    try {
      await fn();
      passed++;
    } catch (e) {
      console.error(`FAIL: ${name} — ${e.message}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
