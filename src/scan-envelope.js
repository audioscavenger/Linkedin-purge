// Scan envelope: the documented shape of `data/scan-<type>.json`.
//
// This is a file contract, not part of the walk: the pre-existing fields keep
// their meanings (type, count, keys, items, scannedAt) and the walk adds
// per-item `step` plus top-level `steps` and `complete`, so `purge --input`
// reads files written before and after the deep scan (ADR 0001).
// Items without a step are first-render items, hence step 0.
export function buildScanEnvelope({ type, items, steps = 1, complete = true, scannedAt = new Date().toISOString() }) {
  const withSteps = (items || []).map((item) => ({
    ...item,
    step: Number.isInteger(item.step) ? item.step : 0,
  }));
  return {
    type,
    count: withSteps.length,
    keys: withSteps.map((item) => item.key).filter(Boolean),
    items: withSteps,
    scannedAt,
    steps,
    complete,
  };
}
