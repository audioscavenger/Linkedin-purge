/*
  Selection loader: reads a selection envelope (as produced by the page's
  Export button, ticket 13) and answers two questions the purge command
  needs: how many items are actionable (anything not final and not a no-op),
  and which identities to act on. Thrown errors name the file and the
  expected shape, so a stale or partial selection fails loudly rather than
  producing a silent empty run.

  A selection item is looked up by Card Identity (`cardId`) with `key` as a
  fallback for envelopes that predate Card Identity (v0.5.0 ADR-0002). Identity
  is NOT the positional `reaction:N` key alone: that only survives a single
  loaded page, so purge --input re-resolves every card by its container id.
*/
import fs from "node:fs";

const NON_ACTIONABLE = new Set(["deleted", "no-op"]);

// Resolve the identity to act on for one item: prefer cardId, then key.
function itemIdentity(item) {
  if (item && typeof item === "object") {
    if (typeof item.cardId === "string" && item.cardId !== "") return item.cardId;
    if (typeof item.key === "string" && item.key !== "") return item.key;
  }
  return null;
}

export function loadSelection(file) {
  const raw = fs.readFileSync(file, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`Malformed JSON in ${file}: ${cause.message}`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Invalid selection in ${file}: expected an object envelope with items[], got ${Array.isArray(data) ? "a bare array" : typeof data}.`);
  }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new Error(`Invalid selection in ${file}: expected an envelope with a non-empty items[] array.`);
  }
  // Every entry must carry at least one usable identity (cardId, else key).
  for (const entry of data.items) {
    if (!itemIdentity(entry)) {
      throw new Error(`Invalid selection in ${file}: every item entry must be an object with a cardId (Card Identity) or a key.`);
    }
  }
  const items = data.items;
  // Actionable = anything not final and not a no-op. Statuses missing in
  // older envelopes default to no-op, matching the fresh-scan default.
  const statusOf = (item) => (item && typeof item.status === "string" && item.status ? item.status : "no-op");
  const actionableItems = items.filter((item) => !NON_ACTIONABLE.has(statusOf(item)));
  const identities = actionableItems.map(itemIdentity);
  const statusMap = new Map();
  for (const item of actionableItems) {
    if (item && typeof item === "object") {
      let id = null;
      if (typeof item.cardId === "string" && item.cardId !== "") id = item.cardId;
      else if (typeof item.key === "string" && item.key !== "") id = item.key;
      const status = typeof item.status === "string" && item.status ? item.status : "no-op";
      if (id) statusMap.set(id, status);
    }
  }
  return {
    type: typeof data.type === "string" && data.type ? data.type : null,
    status: typeof data.status === "string" ? data.status : null,
    total: items.length,
    actionable: actionableItems.length,
    identities,
    statusMap,
    scannedAt: data.scannedAt || null,
  };
}
