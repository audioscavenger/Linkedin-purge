// Unit tests for the purge --input loader (scan JSON envelope contract).
// No browser, no DOM: the loader is exercised as a function over fixture
// files, per the v0.3.4 spec's input-loader seam.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadInputKeys } from "../src/cli/input-keys.js";

// One temp directory for all fixtures; created in main, cleaned up on exit.
let tmp;

// Write a fixture file with the given JSON text and return its path.
function fixture(name, text) {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, text);
  return file;
}

// Assert that fn throws and that the error message mentions all the given
// substrings; throws (test failure) if fn does not throw.
function expectRejection(fn, ...expectedFragments) {
  let error = null;
  try {
    fn();
  } catch (e) {
    error = e;
  }
  if (!error) throw new Error("Expected the loader to throw, but it did not");
  for (const fragment of expectedFragments) {
    if (!error.message.includes(fragment)) {
      throw new Error(`Error should mention "${fragment}", got: ${error.message}`);
    }
  }
}

// Happy path: keys come from the envelope's items[].key (the scan shape).
function testItemsEnvelope() {
  const file = fixture("items-envelope.json", JSON.stringify({
    type: "likes",
    count: 2,
    keys: ["a", "b", "c"],
    items: [{ key: "a", state: "no reaction" }, { key: "b" }],
    scannedAt: "2026-01-01T00:00:00.000Z",
  }));
  const keys = loadInputKeys(file);
  if (keys.length !== 2 || keys[0] !== "a" || keys[1] !== "b") {
    throw new Error(`Expected [a, b], got ${JSON.stringify(keys)}`);
  }
  console.log("PASS: items envelope (keys from items[].key)");
}

// Happy path: keys[] fallback when items is absent.
function testKeysFallback() {
  const file = fixture("keys-fallback.json", JSON.stringify({ keys: ["x", "y"] }));
  const keys = loadInputKeys(file);
  if (keys.length !== 2 || keys[0] !== "x" || keys[1] !== "y") {
    throw new Error(`Expected [x, y], got ${JSON.stringify(keys)}`);
  }
  console.log("PASS: keys fallback (keys[] when items absent)");
}

// A bare key array is rejected with an error naming the expected shape.
function testBareArrayRejection() {
  const file = fixture("bare-array.json", JSON.stringify(["k1", "k2"]));
  expectRejection(
    () => loadInputKeys(file),
    "scan JSON envelope",    // names the expected shape
    "items[].key",           // names the primary source
    "keys[]"                 // names the fallback
  );
  console.log("PASS: bare array rejected with named-shape error");
}

// Malformed JSON fails loudly instead of producing an empty run.
function testMalformedJson() {
  const file = fixture("malformed.json", "{ this is not valid json");
  expectRejection(() => loadInputKeys(file), "Malformed JSON");
  console.log("PASS: malformed JSON fails loudly");
}

// Items made of strings carry no usable key: rejected instead of being
// silently dropped into an empty run (US16).
function testStringItemsRejection() {
  const file = fixture("string-items.json", JSON.stringify({ items: ["a", "b"] }));
  expectRejection(
    () => loadInputKeys(file),
    "Invalid purge input",
    "items[].key",   // names the expected shape
    "object with a non-empty string key"
  );
  console.log("PASS: string items rejected with named-shape error");
}

// An items entry without a usable key (object, but no key field) is
// rejected the same way: no silent empty run.
function testItemWithoutKeyRejection() {
  const file = fixture("item-without-key.json", JSON.stringify({ items: [{ state: "no reaction" }] }));
  expectRejection(
    () => loadInputKeys(file),
    "Invalid purge input",
    "items[].key",
    "object with a non-empty string key"
  );
  console.log("PASS: item entry without a key rejected");
}

// An envelope listing zero keys must fail loudly, naming the file - it
// would otherwise run zero deletions with no explanation.
function testEmptyItemsRejection() {
  const file = fixture("empty-items.json", JSON.stringify({ type: "likes", count: 0, items: [], keys: [] }));
  expectRejection(
    () => loadInputKeys(file),
    "Empty purge input",
    "empty-items.json", // names the file
    "no keys"
  );
  console.log("PASS: empty items list rejected with the no-keys error");
}

// keys[] is the fallback envelope: its entries must be non-empty strings.
function testNonStringKeysRejection() {
  const file = fixture("non-string-keys.json", JSON.stringify({ keys: ["a", 42] }));
  expectRejection(
    () => loadInputKeys(file),
    "Invalid purge input",
    "keys[]",
    "non-empty string"
  );
  console.log("PASS: non-string keys entry rejected");
}

const tests = [
  testItemsEnvelope,
  testKeysFallback,
  testBareArrayRejection,
  testMalformedJson,
  testStringItemsRejection,
  testItemWithoutKeyRejection,
  testEmptyItemsRejection,
  testNonStringKeysRejection,
];

async function main() {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lp-input-keys-"));
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
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const passed = tests.length - failed;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
