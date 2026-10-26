# 07: CLI adapter wiring

**What to build:** The CLI module (`cli.js`) instantiates `PurgeRunner` with concrete adapters and delegates purge execution to it. The 170-line inline purge logic is removed; `runPurge()` becomes a thin adapter that resolves flags, builds adapters, and calls `runner.run()`. Returns the `PurgeResult` summary.

**Blocked by:** 06 (Delete loop orchestration) — now that `src/purge.js` contains the full `run()` implementation, this ticket can start.

**Status:** ready-for-agent

- [ ] Import `PurgeRunner` from the purge module
- [ ] Build concrete adapters (PageAdapter backed by Playwright page; CheckpointAdapter backed by data dir; ReporterAdapter backed by data dir; ConfirmAdapter via readline)
- [ ] Instantiate `PurgeRunner` with concrete adapters
- [ ] Call `runner.run()` and handle the returned `PurgeResult`
- [ ] Remove the 170-line inline `runPurge()` logic from cli.js (or refactor it to delegate)
- [ ] Ensure `--type`, `--timeout`, `--batch-size` CLI flags are wired to `run()` options
- [ ] Ensure existing CLI commands (`login`, `scan`, `status`) remain functional