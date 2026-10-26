# 08: Test suite

**What to build:** Unit tests for `PurgeRunner` using in-memory adapters. Tests run without a real browser, filesystem, or TTY. Each test case creates a synthetic page returning predefined key lists and deletion results.

**Blocked by:** 06 (Delete loop orchestration).

**Status:** ready-for-agent

- [ ] Happy path: 10 items, batch 5 — all deleted, checkpoint saved
- [ ] Timeout during loop stops the run and returns PurgeResult
- [ ] Rate-limit retry with exponential backoff eventually succeeds
- [ ] Empty-scroll detection terminates when no more pending items
- [ ] Ctrl+C cancellation stops after current item
- [ ] Limit reached stops after N deletions
