# 05: Purge input is the scan envelope (ADR 0001)

**What to build:** `--input` accepts exactly the scan JSON envelope — item metadata from `items[].key`, falling back to `keys[]` — and fails with a clear error naming the expected shape for anything else, so a malformed or hand-rolled file cannot become an empty or unexplained run. The narrow contract and its rationale are recorded so it is not quietly widened later.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The input loader accepts only the scan envelope (`items[].key`, fallback `keys[]`); bare key arrays, lone-key objects, and item arrays of strings are rejected with an error that names the expected shape
- [ ] The four speculative shapes are deleted, not deprecated
- [ ] A new input-loader test file (no DOM) covers: items happy path, keys fallback happy path, bare-array rejection with the named-shape error, malformed-JSON failure
- [ ] ADR 0001 is written, recording the scan-envelope-only decision as hard to reverse, surprising without context, and the product of a real trade-off
- [ ] `npm run test` passes
