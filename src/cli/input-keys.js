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
// Strict per the v0.3.4 spec (US16): a typo in the filtered file must not
// become a silent empty run, so entries that lack a usable key are
// rejected (not dropped), and an empty key list fails loudly.
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
    // Every entry must carry a usable key: an object with a non-empty
    // string key. Entries without one (strings, nulls, objects missing
    // the key) are rejected instead of silently dropped to nothing.
    for (const entry of data.items) {
      if (typeof entry !== "object" || entry === null || typeof entry.key !== "string" || entry.key === "") {
        throw new Error(
          `Invalid purge input in ${file}: expected ${expected} - every item entry must be an object with a non-empty string key (items[].key).`
        );
      }
    }
    if (data.items.length === 0) {
      throw emptyEnvelopeError(file);
    }
    return data.items.map((it) => it.key);
  }
  if (Array.isArray(data.keys)) {
    for (const key of data.keys) {
      if (typeof key !== "string" || key === "") {
        throw new Error(
          `Invalid purge input in ${file}: expected ${expected} - every keys entry must be a non-empty string (keys[]).`
        );
      }
    }
    if (data.keys.length === 0) {
      throw emptyEnvelopeError(file);
    }
    return data.keys;
  }
  throw new Error(`Invalid purge input in ${file}: expected ${expected}.`);
}

// An envelope that lists zero keys would run zero deletions: fail loudly
// with the file named instead of purging nothing.
function emptyEnvelopeError(file) {
  return new Error(`Empty purge input in ${file}: the scan envelope lists no keys to purge (no items, no keys) - refusing to run a purge with nothing to delete.`);
}

export { loadInputKeys };
