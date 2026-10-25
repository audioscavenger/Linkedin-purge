# 06: Delete loop orchestration

**What to build:** The `PurgeRunner.run()` method implements the complete purge lifecycle end-to-end: collect items via PageAdapter → filter by checkpoint via CheckpointAdapter → confirm via ConfirmAdapter → delete loop with batch pacing, exponential backoff, timeout tracking, and empty-scroll detection → save checkpoints via CheckpointAdapter → write report via ReporterAdapter. Returns a `PurgeResult` with type, deleted count, processed count, duration, and report path.

**Blocked by:** 02, 03, 04, 05 (all adapters must be implemented first) — all four are now in `src/purge.js`.

**Status:** ready-for-agent

- [ ] Collect keys via PageAdapter, filter out already-processed keys via CheckpointAdapter
- [ ] Confirm via ConfirmAdapter before deleting anything
- [ ] Delete loop processes items one at a time with batch pauses every N deletions
- [ ] Exponential backoff on consecutive failures
- [ ] Timeout tracking stops the loop when the configured timeout is exceeded
- [ ] Empty-scroll detection stops when no more pending items exist
- [ ] Checkpoint saved periodically during the loop
- [ ] Report written at the end via ReporterAdapter
- [ ] Returns PurgeResult summary object