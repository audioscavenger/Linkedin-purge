// Unit tests for PurgeRunner using in-memory adapters (no browser/FS/TTY).
import { PurgeRunner, PageAdapter, CheckpointAdapter, ReporterAdapter, ConfirmAdapter } from "../src/purge.js";

class FakePageAdapter {
  constructor({ keys = [], deleteResult = { ok: false, key: null, skip: false } } = {}) {
    this.keys = keys;
    this.deleteResult = deleteResult;
  }
  async collectKeys() { return [...this.keys]; }
  async deleteFirstEligible(skipKeys) {
    const nextKey = this.keys.find(k => !skipKeys.includes(k));
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

const tests = { testHappyPath, testConfirmationAbort };

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