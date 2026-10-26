// Purge --input loader: --input accepts only the scan JSON envelope
// (see docs/adr/0001-purge-input-is-scan-envelope.md).
//
// The scan command writes this envelope:
//   { type, count, keys: [K], items: [{ key: K, ... }], scannedAt }
// This module extracts the keys; every other shape is rejected.
import fs from "node:fs";

// Load a JSON file and extract the list of keys to purge.
// Accepts only the scan JSON envelope:
//   - { items: [{ key: "..." }] }  keys from items[].key
//   - { keys: ["..."] }            fallback when items is absent
// Bare arrays (of keys or of strings), lone-key objects, and any other
// shape are rejected with an error that names the expected shape.
// Malformed JSON fails loudly rather than producing an empty run.
function loadInputKeys(file) {
  const raw = fs.readFileSync(file, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`Malformed JSON in ${file}: ${cause.message}`);
  }
  const expected = "a scan JSON envelope with items[].key, falling back to keys[]";
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    const got = Array.isArray(data) ? "a bare array" : typeof data;
    throw new Error(`Invalid purge input in ${file}: expected ${expected}, got ${got}.`);
  }
  if (Array.isArray(data.items)) {
    return data.items.map((it) => it && it.key).filter(Boolean);
  }
  if (Array.isArray(data.keys)) {
    return data.keys;
  }
  throw new Error(`Invalid purge input in ${file}: expected ${expected}.`);
}

export { loadInputKeys };
