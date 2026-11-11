// Unit tests for PurgeRunner using in-memory adapters (no browser/FS/TTY).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PurgeRunner } from "../src/purge.mjs";
import { EnvelopeStore } from "../src/envelope-store.mjs";

class FakePageAdapter {
  constructor({ keys = [], refusals = new Set() } = {}) {
    this.keys = keys;
    this.refusals = refusals; // set of keys that should fail (refusal)
  }
  async collect() {
    return [...this.keys];
  }
  async collectKeys() {
    return this.collect();
  }
  async collectCardIds() {
    return this.keys.map((key) => key);
  }
  async oneCardAct(key) {
    if (!this.keys.includes(key)) {
      return { ok: false, skip: false, cardId: key, error: "card not found" };
    }
    if (this.refusals.has(key)) {
      return { ok: false, key, error: "refused" };
    }
    return {
      ok: true,
      cardId: key,
      key,
      state: "no reaction",
      author: "Test Author",
      postHref: "/feed/update/1",
      dateTime: "2026-01-01T00:00:00Z",
    };
  }
  async loadStep() {
    return Promise.resolve();
  }
  async wait(_ms) {
    return Promise.resolve();
  }
  async waitForTimeout(_ms) {
    return Promise.resolve();
  }
}

class FakeConfirmAdapter {
  constructor(answer = true) {
    this.answer = answer;
  }
  async confirm(_message) {
    return this.answer;
  }
}

// Basic tests demonstrating in-memory adapter pattern
async function testHappyPath() {
  const page = new FakePageAdapter({
    keys: ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9", "k10"],
  });
  const confirm = new FakeConfirmAdapter(true);

  const runner = new PurgeRunner({
    pageAdapter: page,
    confirmAdapter: confirm,
  });
  const result = await runner.run({
    type: "likes",
    timeoutMs: 3600000,
    batchSize: 5,
  });

  if (result.deleted !== 10)
    throw new Error(`Expected deleted=10, got ${result.deleted}`);
  console.log("PASS: happy path (10 items deleted)");
}

// Verify that inputKeys restricts deletion to only the keys in the input set.
async function testInputKeysFilter() {
  const page = new FakePageAdapter({ keys: ["k1", "k2", "k3", "k4", "k5"] });
  const confirm = new FakeConfirmAdapter(true);

  const runner = new PurgeRunner({
    pageAdapter: page,
    confirmAdapter: confirm,
  });
  // Only k2 and k4 should be deleted (inputKeys filter)
  const result = await runner.run({
    type: "likes",
    timeoutMs: 3600000,
    batchSize: 5,
    inputKeys: ["k2", "k4"],
  });

  if (result.deleted !== 2)
    throw new Error(`Expected deleted=2, got ${result.deleted}`);
  if (result.counts.deleted !== 2)
    throw new Error(`Expected purged=2, got ${result.counts.deleted}`);
  console.log("PASS: inputKeys filter (only k2, k4 deleted)");
}

// Selection of two items on a longer history acts on those two and stops early.
async function testSelectionStopsEarly() {
  const page = new FakePageAdapter({
    keys: ["a1", "a2", "a3", "a4", "a5", "a6", "a7"],
  });
  const confirm = new FakeConfirmAdapter(true);

  const runner = new PurgeRunner({
    pageAdapter: page,
    confirmAdapter: confirm,
  });
  // Select only a2 and a5 from the longer history
  const result = await runner.run({
    type: "likes",
    timeoutMs: 3600000,
    batchSize: 5,
    inputKeys: ["a2", "a5"],
  });

  if (result.deleted !== 2)
    throw new Error(`Expected deleted=2, got ${result.deleted}`);
  if (result.counts.deleted !== 2)
    throw new Error(`Expected purged=2, got ${result.counts.deleted}`);
  console.log(
    "PASS: selection of two items on longer history acts on those two and stops early"
  );
}

// Items not in the selection keep no-op (not acted on, not counted).
async function testUnselectedKeepNoOp() {
  const page = new FakePageAdapter({ keys: ["x1", "x2", "x3", "x4", "x5"] });
  const confirm = new FakeConfirmAdapter(true);

  const runner = new PurgeRunner({
    pageAdapter: page,
    confirmAdapter: confirm,
  });
  // Select only x2 and x4
  const result = await runner.run({
    type: "likes",
    timeoutMs: 3600000,
    batchSize: 5,
    inputKeys: ["x2", "x4"],
  });

  if (result.deleted !== 2)
    throw new Error(`Expected deleted=2, got ${result.deleted}`);
  if (result.counts.deleted !== 2 || result.counts.noOp !== 0) {
    throw new Error(`bad counts: ${JSON.stringify(result.counts)}`);
  }
  console.log("PASS: unselected items keep no-op");
}

// Success writes `purged` through the store, refusal writes `failed` through the store.
async function testSelectionWritesPurgedAndFailed() {
  const page = new FakePageAdapter({
    keys: ["s1", "s2"],
    refusals: new Set(["s2"]), // s2 will be refused
  });
  const confirm = new FakeConfirmAdapter(true);

  const runner = new PurgeRunner({
    pageAdapter: page,
    confirmAdapter: confirm,
  });
  const result = await runner.run({
    type: "likes",
    timeoutMs: 3600000,
    batchSize: 5,
    inputKeys: ["s1", "s2"],
  });

  if (result.counts.deleted !== 1)
    throw new Error(`Expected purged=1, got ${result.counts.deleted}`);
  if (result.counts.failed !== 1)
    throw new Error(`Expected failed=1, got ${result.counts.failed}`);
  console.log(
    "PASS: success writes purged-state, refusal writes failed through store"
  );
}

// Runner indifference to page order: the order of keys on the page does not affect
// which selected items are acted on or the results.
async function testSelectionIndifferentToPageOrder() {
  const keysPageOrder1 = ["a", "b", "c", "d", "e"]; // selected: b, d
  const keysPageOrder2 = ["e", "d", "c", "b", "a"]; // same keys, reversed
  const selected = ["b", "d"];

  for (const [label, keys] of Object.entries({
    normal: keysPageOrder1,
    reversed: keysPageOrder2,
  })) {
    const page = new FakePageAdapter({ keys });
    const confirm = new FakeConfirmAdapter(true);

    const runner = new PurgeRunner({
      pageAdapter: page,
      confirmAdapter: confirm,
    });
    const result = await runner.run({
      type: "likes",
      timeoutMs: 3600000,
      batchSize: 5,
      inputKeys: selected,
    });

    if (result.deleted !== 2)
      throw new Error(`${label}: expected deleted=2, got ${result.deleted}`);
    if (result.counts.deleted !== 2)
      throw new Error(
        `${label}: expected purged=2, got ${result.counts.deleted}`
      );
  }
  console.log("PASS: runner indifferent to page order");
}

// A selected item whose Card Identity is not on the page ends as
// not-found (reported by identity), never as a generic failure.
async function testSelectionNotFoundMarkedNotFound() {
  const page = new FakePageAdapter({ keys: ["k1", "k2"] });
  const confirm = new FakeConfirmAdapter(true);

  const runner = new PurgeRunner({
    pageAdapter: page,
    confirmAdapter: confirm,
  });
  // k-ghost is selected but not present on the page.
  const result = await runner.run({
    type: "likes",
    batchSize: 5,
    inputKeys: ["k1", "k-ghost"],
  });

  if (
    result.counts.deleted !== 1 ||
    result.counts.failed !== 0 ||
    result.counts.notFound !== 1 ||
    result.counts.noOp !== 0
  ) {
    throw new Error(`bad counts: ${JSON.stringify(result.counts)}`);
  }
  console.log(
    "PASS: exhausted walk marks unmatched selection not-found and reports it by identity"
  );
}

/*
  Re-run of the same selection: purged skipped, failed and not-found retried,
  no-op never touched; results are counted per status. Statuses persist in
  the envelope store (replacing the retired checkpoint).
*/
async function testSelectionRetryRunSkipsPurgedRetriesRest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lp-retry-"));
  const file = path.join(tmp, "selection-likes.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      type: "likes",
      items: [
        { key: "reaction:a", cardId: "card-a", status: "todo" },
        { key: "reaction:b", cardId: "card-b", status: "todo" },
      ],
    })
  );

  const page = new FakePageAdapter({
    keys: ["card-a", "card-b"],
    refusals: new Set(["card-b"]),
  });
  const confirm = new FakeConfirmAdapter(true);
  const store = new EnvelopeStore({ file });

  // First run: a purged, b failed
  const runner1 = new PurgeRunner({
    pageAdapter: page,
    confirmAdapter: confirm,
    envelopeStore: store,
  });
  const first = await runner1.run({
    type: "likes",
    batchSize: 5,
    inputKeys: ["card-a", "card-b"],
  });
  if (first.counts.deleted !== 1 || first.counts.failed !== 1) {
    throw new Error(`bad first-run counts: ${JSON.stringify(first.counts)}`);
  }

  // Second run: b no longer refuses; a is purged (skipped), b retried → purged
  page.refusals.clear();
  const runner2 = new PurgeRunner({
    pageAdapter: page,
    confirmAdapter: confirm,
    envelopeStore: store,
  });
  const second = await runner2.run({
    type: "likes",
    batchSize: 5,
    inputKeys: ["card-a", "card-b"],
  });
  if (second.deleted !== 1)
    throw new Error(`retry must act only on b, deleted=${second.deleted}`);
  if (
    second.counts.deleted !== 1 ||
    second.counts.noOp !== 1 ||
    second.counts.failed !== 0 ||
    second.counts.notFound !== 0
  ) {
    throw new Error(`bad retry counts: ${JSON.stringify(second.counts)}`);
  }
  const marked = JSON.parse(fs.readFileSync(file, "utf8"));
  const by = Object.fromEntries(marked.items.map((i) => [i.cardId, i.status]));
  if (by["card-a"] !== "deleted" || by["card-b"] !== "deleted") {
    throw new Error(`envelope not both deleted: ${JSON.stringify(by)}`);
  }
  console.log(
    "PASS: re-run skips purged, retries failed and not-found, leaves no-op alone"
  );
}

/*
  A selection run persists statuses into the selection envelope through the
  store: an item purged on the page is marked purged on disk, one whose card
  is missing ends not-found, and every mark is its own atomic write.
*/
async function testSelectionMarksEnvelopeAtomically() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lp-selmark-"));
  const file = path.join(tmp, "selection-likes.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      type: "likes",
      items: [
        { key: "reaction:0", cardId: "card-1", status: "todo" },
        { key: "reaction:1", cardId: "card-2", status: "todo" },
      ],
    })
  );

  const page = new FakePageAdapter({ keys: ["card-1"] });
  const confirm = new FakeConfirmAdapter(true);
  const store = new EnvelopeStore({ file });

  const runner = new PurgeRunner({
    pageAdapter: page,
    confirmAdapter: confirm,
    envelopeStore: store,
  });
  // Selection passes only actionable identities, as the command does.
  const result = await runner.run({
    type: "likes",
    batchSize: 5,
    inputKeys: ["card-1", "card-2"],
  });

  const marked = JSON.parse(fs.readFileSync(file, "utf8"));
  const by = Object.fromEntries(marked.items.map((i) => [i.cardId, i.status]));
  if (by["card-1"] !== "deleted")
    throw new Error(`card-1 expected deleted on disk, got ${by["card-1"]}`);
  if (by["card-2"] !== "not-found")
    throw new Error(`card-2 expected not-found on disk, got ${by["card-2"]}`);
  if (result.counts.deleted !== 1 || result.counts.notFound !== 1) {
    throw new Error(`bad counts: ${JSON.stringify(result.counts)}`);
  }
  console.log(
    "PASS: selection run marks the envelope atomically (purged and not-found)"
  );
}

const tests = {
  testHappyPath,
  testInputKeysFilter,
  testSelectionStopsEarly,
  testUnselectedKeepNoOp,
  testSelectionWritesPurgedAndFailed,
  testSelectionIndifferentToPageOrder,
  testSelectionNotFoundMarkedNotFound,
  testSelectionRetryRunSkipsPurgedRetriesRest,
  testSelectionMarksEnvelopeAtomically,
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
