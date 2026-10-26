// Unit tests for PurgeRunner using in-memory adapters (no browser/FS/TTY).
import { PurgeRunner, PageAdapter, CheckpointAdapter, ReporterAdapter, ConfirmAdapter } from "../src/purge.js";

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
  async clickShowMoreIfPresent() { return false; }
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

const tests = { testHappyPath, testInputKeysFilter, testCheckpointNotRedeleted, testConfirmationAbort };

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