// Unit tests for the envelope store: load, per-item mark by Card Identity,
// atomic on-disk write, reload after an interrupt, and unknown identity.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";
import { EnvelopeStore } from "../src/envelope-store.mjs";

let tmp;

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

async function testLoad() {
  const dir = fs.mkdtempSync(path.join(tmp, "load-"));

  const data = envelope([
    { key: "reaction:1", cardId: "card-1", status: "no-op" },
    { key: "reaction:2", cardId: "card-2", status: "no-op" },
  ]);

  fs.writeFileSync(
    path.join(dir, "scan-likes.json"),
    JSON.stringify(data, null, 2)
  );
  const store = new EnvelopeStore({ dataDir: dir, type: "likes" });
  const loaded = await store.load();
  assert.strictEqual(loaded.count, 2, "load returns the envelope");
  assert.strictEqual(
    store.envelope.items.length,
    2,
    "store holds the envelope"
  );
  console.log("PASS: load");
}

async function testMarkWritesDisk() {
  const dir = fs.mkdtempSync(path.join(tmp, "mark-"));

  const data = envelope([
    { key: "reaction:1", cardId: "card-1", status: "no-op" },
  ]);

  const file = path.join(dir, "scan-likes.json");
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  const store = new EnvelopeStore({ dataDir: dir, type: "likes" });
  await store.load();
  await store.mark("card-1", "deleted");
  // No separate save call: the file on disk must already reflect the mark.
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.strictEqual(
    onDisk.items[0].status,
    "deleted",
    "mark writes the file on disk"
  );
  console.log("PASS: mark writes disk");
}

async function testReloadAfterInterrupt() {
  const dir = fs.mkdtempSync(path.join(tmp, "reload-"));

  const data = envelope([
    { key: "reaction:1", cardId: "card-1", status: "no-op" },
    { key: "reaction:2", cardId: "card-2", status: "no-op" },
  ]);

  const file = path.join(dir, "scan-likes.json");
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  const store = new EnvelopeStore({ dataDir: dir, type: "likes" });
  await store.load();
  await store.mark("card-1", "deleted");
  // Simulate an interrupt: discard the in-memory store, then reload from disk.
  const store2 = new EnvelopeStore({ dataDir: dir, type: "likes" });
  await store2.load();
  const counts = await store2.counts();
  assert.strictEqual(counts.deleted, 1, "reload sees the earned status");
  assert.strictEqual(counts["no-op"], 1, "reload keeps the untouched item");
  console.log("PASS: reload after interrupt");
}

async function testUnknownIdentity() {
  const dir = fs.mkdtempSync(path.join(tmp, "unknown-"));

  const data = envelope([
    { key: "reaction:1", cardId: "card-1", status: "no-op" },
  ]);

  const file = path.join(dir, "scan-likes.json");
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  const store = new EnvelopeStore({ dataDir: dir, type: "likes" });
  await store.load();
  let threw = false;

  try {
    await store.mark("no-such-card", "deleted");
  } catch (e) {
    threw = true;
    assert.ok(e instanceof Error, "throws an Error");
  }

  assert.ok(threw, "marking an unknown identity throws");
  // The item must not have been created.
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.strictEqual(
    onDisk.items.length,
    1,
    "no item created for unknown identity"
  );
  console.log("PASS: unknown identity");
}

async function testAtomicity() {
  const dir = fs.mkdtempSync(path.join(tmp, "atomic-"));

  const data = envelope([
    { key: "reaction:1", cardId: "card-1", status: "no-op" },
  ]);

  const file = path.join(dir, "scan-likes.json");
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  const store = new EnvelopeStore({ dataDir: dir, type: "likes" });
  await store.load();
  await store.mark("card-1", "deleted");
  // After a successful mark there must be no leftover temp files.
  const leftovers = fs.readdirSync(dir).filter((n) => n.includes(".tmp"));
  assert.strictEqual(leftovers.length, 0, "no leftover temp files");
  // The file must be valid JSON (never truncated).
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.strictEqual(
    parsed.items[0].status,
    "deleted",
    "file is valid and updated"
  );
  console.log("PASS: atomicity");
}

async function testCounts() {
  const dir = fs.mkdtempSync(path.join(tmp, "counts-"));

  const data = envelope([
    { key: "a", cardId: "c1", status: "deleted" },
    { key: "b", cardId: "c2", status: "failed" },
    { key: "c", cardId: "c3", status: "not-found" },
    { key: "d", cardId: "c4", status: "todo" },
    { key: "e", cardId: "c5", status: "no-op" },
  ]);

  fs.writeFileSync(
    path.join(dir, "scan-likes.json"),
    JSON.stringify(data, null, 2)
  );
  const store = new EnvelopeStore({ dataDir: dir, type: "likes" });
  await store.load();
  const counts = await store.counts();
  assert.deepStrictEqual(counts, {
    "no-op": 1,
    todo: 1,
    deleted: 1,
    failed: 1,
    "not-found": 1,
  });
  console.log("PASS: counts");
}

const tests = [
  testLoad,
  testMarkWritesDisk,
  testReloadAfterInterrupt,
  testUnknownIdentity,
  testAtomicity,
  testCounts,
];

async function main() {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "envstore-"));
  let failed = 0;

  for (const fn of tests) {
    try {
      await fn();
    } catch (e) {
      console.error(`FAIL: ${fn.name} - ${e.message}`);
      failed++;
    }
  }

  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) {
    // Best effort cleanup; ignore errors.
    void e;
  }

  const passed = tests.length - failed;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
