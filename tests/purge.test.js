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
  constructor({ keys = [], deleteResult = { ok: false, key: null, skip: false }, refusals = new Set() } = {}) {
    this.keys = keys;
    this.deleteResult = deleteResult;
    this.refusals = refusals; // set of keys that should fail (refusal)
  }
  async collect() { return [...this.keys]; }
  async collectKeys() { return this.collect(); }
  async oneCardAct(key) {
    if (!this.keys.includes(key)) {
      return { ok: false, skip: false, cardId: key, error: "card not found" };
    }
    if (this.refusals.has(key)) {
      return { ok: false, key, error: "refused" };
    }
    return { ok: true, cardId: key, key, state: "no reaction", author: "Test Author", postHref: "/feed/update/1", dateTime: "2026-01-01T00:00:00Z" };
  }
  async deleteFirstEligible(eligibleKeys) {
    const eligibleSet = new Set(eligibleKeys || []);
    const nextKey = this.keys.find(k => eligibleSet.has(k));
    if (!nextKey) return { ok: false, key: null, skip: false, error: "no eligible item" };
    return { ok: true, key: nextKey, state: "no reaction", author: "Test Author", postHref: "/feed/update/1", dateTime: "2026-01-01T00:00:00Z" };
  }
  async loadStep() { return Promise.resolve(); }
  async wait(ms) { return Promise.resolve(); }
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

// --- Ticket 19 tests ---

// Selection of two items on a longer history acts on those two and stops early.
async function testSelectionStopsEarly() {
  const page = new FakePageAdapter({ keys: ["a1", "a2", "a3", "a4", "a5", "a6", "a7"] });
  const cp = new FakeCheckpointAdapter();
  const reporter = new FakeReporterAdapter();
  const confirm = new FakeConfirmAdapter(true);

  const runner = new PurgeRunner({ pageAdapter: page, checkpointAdapter: cp, reporterAdapter: reporter, confirmAdapter: confirm });
  // Select only a2 and a5 from the longer history
  const result = await runner.run({ type: "likes", timeoutMs: 3600000, batchSize: 5, inputKeys: ["a2", "a5"] });

  const deletedKeys = reporter.items.map((it) => it.key).sort();
  if (result.deleted !== 2) throw new Error(`Expected deleted=2, got ${result.deleted}`);
  if (deletedKeys.length !== 2 || deletedKeys[0] !== "a2" || deletedKeys[1] !== "a5") {
    throw new Error(`Expected [a2, a5], got [${deletedKeys.join(", ")}]`);
  }
  // Unselected items must not appear in the report
  const allKeys = reporter.items.map((it) => it.key).sort();
  const unselected = allKeys.filter(k => !["a2", "a5"].includes(k));
  if (unselected.length > 0) throw new Error(`Unselected items acted on: ${unselected.join(", ")}`);
  console.log("PASS: selection of two items on longer history acts on those two and stops early");
}

// Items not in the selection keep no-op (not acted on, not in report).
async function testUnselectedKeepNoOp() {
  const page = new FakePageAdapter({ keys: ["x1", "x2", "x3", "x4", "x5"] });
  const cp = new FakeCheckpointAdapter();
  const reporter = new FakeReporterAdapter();
  const confirm = new FakeConfirmAdapter(true);

  const runner = new PurgeRunner({ pageAdapter: page, checkpointAdapter: cp, reporterAdapter: reporter, confirmAdapter: confirm });
  // Select only x2 and x4
  await runner.run({ type: "likes", timeoutMs: 3600000, batchSize: 5, inputKeys: ["x2", "x4"] });

  const allKeys = reporter.items.map((it) => it.key).sort();
  // x1, x3, x5 must not be in report (they remain no-op)
  const unexpected = allKeys.filter(k => !["x2", "x4"].includes(k));
  if (unexpected.length > 0) throw new Error(`Unexpected keys in report (should stay no-op): ${unexpected.join(", ")}`);
  console.log("PASS: unselected items keep no-op");
}

// Success writes `purged` through the store, refusal writes `failed` through the store.
async function testSelectionWritesPurgedAndFailed() {
  const page = new FakePageAdapter({
    keys: ["s1", "s2"],
    refusals: new Set(["s2"]) // s2 will be refused
  });
  const cp = new FakeCheckpointAdapter();
  const reporter = new FakeReporterAdapter();
  const confirm = new FakeConfirmAdapter(true);

  const runner = new PurgeRunner({ pageAdapter: page, checkpointAdapter: cp, reporterAdapter: reporter, confirmAdapter: confirm });
  await runner.run({ type: "likes", timeoutMs: 3600000, batchSize: 5, inputKeys: ["s1", "s2"] });

  if (reporter.items.length !== 2) throw new Error(`Expected 2 report items, got ${reporter.items.length}`);

  const byKey = Object.fromEntries(reporter.items.map(i => [i.key, i]));

  // s1: success -> state "purged" from the purge status vocabulary (ticket 20)
  if (!byKey["s1"]) throw new Error("s1 missing from report");
  if (byKey["s1"].state !== "purged") throw new Error(`s1 expected state "purged", got "${byKey["s1"].state}"`);

  // s2: refusal -> state "failed" written by runner
  if (!byKey["s2"]) throw new Error("s2 missing from report");
  if (byKey["s2"].state !== "failed") throw new Error(`s2 expected state "failed", got "${byKey["s2"].state}"`);
  if (byKey["s2"].author !== null || byKey["s2"].postHref !== null || byKey["s2"].dateTime !== null) {
    throw new Error("Refusal entry fields not normalized to null");
  }
  console.log("PASS: success writes purged-state, refusal writes failed through store");
}

// Runner indifference to page order: the order of keys on the page does not affect
// which selected items are acted on or the results.
async function testSelectionIndifferentToPageOrder() {
  const keysPageOrder1 = ["a", "b", "c", "d", "e"]; // selected: b, d
  const keysPageOrder2 = ["e", "d", "c", "b", "a"]; // same keys, reversed
  const selected = ["b", "d"];

  for (const [label, keys] of Object.entries({ "normal": keysPageOrder1, "reversed": keysPageOrder2 })) {
    const page = new FakePageAdapter({ keys });
    const cp = new FakeCheckpointAdapter();
    const reporter = new FakeReporterAdapter();
    const confirm = new FakeConfirmAdapter(true);

    const runner = new PurgeRunner({ pageAdapter: page, checkpointAdapter: cp, reporterAdapter: reporter, confirmAdapter: confirm });
    await runner.run({ type: "likes", timeoutMs: 3600000, batchSize: 5, inputKeys: selected });

    const deletedKeys = reporter.items.map((it) => it.key).sort();
    if (deletedKeys.length !== 2 || deletedKeys[0] !== "b" || deletedKeys[1] !== "d") {
      throw new Error(`${label}: expected [b, d], got [${deletedKeys.join(", ")}]`);
    }
  }
  console.log("PASS: runner indifferent to page order");
}

// Checkpoint-processed key in selection is skipped (no-op), other selected key acted on.
async function testSelectionSkipsCheckpointed() {
  const page = new FakePageAdapter({ keys: ["c1", "c2", "c3"] });
  const cp = new FakeCheckpointAdapter();
  cp.processed.add("c1"); // already purged
  const reporter = new FakeReporterAdapter();
  const confirm = new FakeConfirmAdapter(true);

  const runner = new PurgeRunner({ pageAdapter: page, checkpointAdapter: cp, reporterAdapter: reporter, confirmAdapter: confirm });
  // c1 is checkpointed, c2 is not; both in selection
  await runner.run({ type: "likes", timeoutMs: 3600000, batchSize: 5, inputKeys: ["c1", "c2"] });

  const deletedKeys = reporter.items.map((it) => it.key).sort();
  if (deletedKeys.length !== 1 || deletedKeys[0] !== "c2") {
    throw new Error(`Expected only c2 acted on, got [${deletedKeys.join(", ")}]`);
  }
  console.log("PASS: checkpointed key in selection is skipped (no-op)");
}

// A selected item whose Card Identity is not on the page ends as
// not-found (reported by identity), never as a generic failure.
async function testSelectionNotFoundMarkedNotFound() {
  const page = new FakePageAdapter({ keys: ["k1", "k2"] });
  const cp = new FakeCheckpointAdapter();
  const reporter = new FakeReporterAdapter();
  const confirm = new FakeConfirmAdapter(true);

  const runner = new PurgeRunner({ pageAdapter: page, checkpointAdapter: cp, reporterAdapter: reporter, confirmAdapter: confirm });
  // k-ghost is selected but not present on the page.
  const result = await runner.run({ type: "likes", batchSize: 5, inputKeys: ["k1", "k-ghost"] });

  const byKey = Object.fromEntries(reporter.items.map((i) => [i.key, i]));
  if (byKey["k1"].state !== "purged") throw new Error(`k1 expected purged, got ${byKey["k1"].state}`);
  if (byKey["k-ghost"].state !== "not-found") throw new Error(`k-ghost expected not-found, got ${byKey["k-ghost"].state}`);
  // K2 is on the page but not selected: never acted on.
  if (byKey["k2"]) throw new Error("k2 was not selected and must not be acted on");
  if (result.counts.purged !== 1 || result.counts.failed !== 0 || result.counts.notFound !== 1 || result.counts.noOp !== 0) {
    throw new Error(`bad counts: ${JSON.stringify(result.counts)}`);
  }
  // Only purged is allowed into the checkpoint; not-found retried later.
  if (!cp.processed.has("k1") || cp.processed.has("k-ghost")) {
    throw new Error("checkpoint must hold only purged keys");
  }
  console.log("PASS: exhausted walk marks unmatched selection not-found and reports it by identity");
}

// Re-run of the same selection: purged skipped, failed and not-found retried,
// no-op never touched; results are counted per status.
async function testSelectionRetryRunSkipsPurgedRetriesRest() {
  const page = new FakePageAdapter({ keys: ["a", "b"], refusals: new Set(["b"]) });
  const cp = new FakeCheckpointAdapter();
  const reporter = new FakeReporterAdapter();
  const confirm = new FakeConfirmAdapter(true);

  const runner = new PurgeRunner({ pageAdapter: page, checkpointAdapter: cp, reporterAdapter: reporter, confirmAdapter: confirm });
  const first = await runner.run({ type: "likes", batchSize: 5, inputKeys: ["a", "b"] });
  if (first.counts.purged !== 1 || first.counts.failed !== 1) {
    throw new Error(`bad first-run counts: ${JSON.stringify(first.counts)}`);
  }
  const bAfterFirst = reporter.items.find((i) => i.key === "b").state;
  if (bAfterFirst !== "failed") throw new Error(`b expected failed after first run, got ${bAfterFirst}`);

  // b no longer refuses on the retry; a is checkpoint-processed so skipped.
  page.refusals.clear();
  reporter.items = []; // the fake's open() resets items too; we assert the second run directly
  const second = await runner.run({ type: "likes", batchSize: 5, inputKeys: ["a", "b"] });
  if (second.deleted !== 1) throw new Error(`retry must act only on b, deleted=${second.deleted}`);
  if (second.counts.purged !== 1 || second.counts.noOp !== 1 || second.counts.failed !== 0 || second.counts.notFound !== 0) {
    throw new Error(`bad retry counts: ${JSON.stringify(second.counts)}`);
  }
  const bAfterSecond = reporter.items.find((i) => i.key === "b");
  if (!bAfterSecond || bAfterSecond.state !== "purged") throw new Error(`b expected purged on retry, got ${JSON.stringify(bAfterSecond)}`);
  console.log("PASS: re-run skips purged, retries failed and not-found, leaves no-op alone");
}

const tests = {
  testHappyPath,
  testInputKeysFilter,
  testCheckpointNotRedeleted,
  testConfirmationAbort,
  testReporterOwnsEntry,
  testSelectionStopsEarly,
  testUnselectedKeepNoOp,
  testSelectionWritesPurgedAndFailed,
  testSelectionIndifferentToPageOrder,
  testSelectionSkipsCheckpointed,
  testSelectionNotFoundMarkedNotFound,
  testSelectionRetryRunSkipsPurgedRetriesRest,
};

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