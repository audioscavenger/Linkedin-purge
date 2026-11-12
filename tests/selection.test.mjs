// Unit tests for the selection loader (src/cli/selection.js).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";
import { loadSelection } from "../src/cli/selection.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lp-selection-"));

function fixture(name, content) {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, content);

  return file;
}

// Happy path: only the pending items are actionable; cardId is preferred.
const full = fixture(
  "sel.json",
  JSON.stringify({
    type: "likes",
    count: 4,
    keys: ["k1", "k2", "k3", "k4"],
    scannedAt: "2026-11-05T00:00:00.000Z",
    selectedAt: "2026-11-05T01:00:00.000Z",
    items: [
      { key: "reaction:0", cardId: "card-a", status: "deleted" },
      { key: "reaction:1", cardId: "card-b", status: "todo" },
      { key: "reaction:2", cardId: "card-c", status: "failed" },
      { key: "reaction:3", cardId: "card-d", status: "no-op" },
    ],
  })
);

const sel = loadSelection(full);

assert.equal(sel.type, "likes");

assert.equal(sel.total, 4);

assert.equal(sel.actionable, 2, "failed and pending are actionable");

assert.deepEqual(
  sel.identities,
  ["card-b", "card-c"],
  "cardId preferred over key"
);

assert.ok(sel.statusMap instanceof Map, "statusMap is a Map");

assert.strictEqual(
  sel.statusMap.get("card-b"),
  "todo",
  "statusMap maps identity to its selection status"
);

assert.strictEqual(
  sel.statusMap.get("card-c"),
  "failed",
  "statusMap carries every actionable status"
);

assert.ok(!sel.statusMap.has("card-a"), "statusMap excludes final items");

assert.ok(!sel.statusMap.has("card-d"), "statusMap excludes no-op items");

// All items final: nothing actionable (purge exits without prompting).
const finalSel = fixture(
  "final.json",
  JSON.stringify({
    items: [
      { cardId: "card-a", status: "deleted" },
      { cardId: "card-b", status: "no-op" },
    ],
  })
);

const fs2 = loadSelection(finalSel);

assert.equal(fs2.actionable, 0);

assert.deepEqual(fs2.identities, []);

// Fallback: entries without cardId use key (pre-cardId selections).
const keysSel = fixture(
  "keys.json",
  JSON.stringify({
    items: [{ key: "reaction:9", status: "todo" }],
  })
);

assert.deepEqual(loadSelection(keysSel).identities, ["reaction:9"]);

// Entries with neither cardId nor key are rejected, naming the file.
const bad = fixture(
  "bad.json",
  JSON.stringify({ items: [{ status: "todo" }] })
);

assert.throws(() => loadSelection(bad), /cardId \(Card Identity\) or a key/);

// Malformed JSON fails loudly with the file named.
const broken = fixture("broken.json", "{ not json");

assert.throws(() => loadSelection(broken), /Malformed JSON/);

// Bare array is rejected, not silently treated as empty.
const bare = fixture("bare.json", "[]");

assert.throws(() => loadSelection(bare), /Invalid selection/);

// Empty items array is rejected.
const empty = fixture("empty.json", JSON.stringify({ items: [] }));

assert.throws(() => loadSelection(empty), /non-empty items/);

console.log(
  "PASS: selection loader (identities prefer cardId, actionable filter, strict errors)"
);
