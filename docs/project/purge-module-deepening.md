# Purge Module Deepening - Final Implementation

## Problem Statement

The purge intake module (`src/cli.js:runPurge`) is shallow — 170-line function spanning `cli.js`, `checkpoint.js`, and `linkedin-dom.js` with no single module owning the full lifecycle. Changes to batching, timeout, or report metadata require edits across files. The interface is nearly as complex as the implementation.

## Solution

- **Module**: `src/purge.js` (226 lines) — new module with `PurgeRunner` class exposing `run(options): PurgeResult`
- **Seam location**: `cli.js` ↔ `purge.js` (CLI adapter ↔ domain module)
- **Adapters** (all concrete implementations):
  - `PageAdapter` — wraps Playwright `page` for `collectKeys`, `deleteFirstEligible`, `clickShowMoreIfPresent`, `waitForTimeout`
  - `CheckpointAdapter` — `load`, `has`, `add`, `save`, `reset`, `size()` (absorbs `src/checkpoint.js`)
  - `ReporterAdapter` — `open`, `write`, `close` for report JSON
  - `ConfirmAdapter` — readline prompt returning boolean
- **Deep implementation**: loop controller, batch pacing, exponential backoff, timeout tracking, empty-scroll detection, report aggregation
- **Domain vocabulary**: "Purge Run", "Purge Item", "Key", "Checkpoint", "ConfirmAdapter" (updated in `GLOSSARY.md`)
- **Testability**: in-memory adapters for all concerns; `tests/purge.test.js` covers core scenarios

## Implementation Decisions

1. **Module**: `src/purge.js` — new module with `PurgeRunner` class
2. **Seam**: `cli.js` ↔ `purge.js` — CLI adapter delegates to runner
3. **Adapters**: All four adapters implemented with clear responsibility boundaries
4. **Checkpoint**: `CheckpointAdapter` now includes `size()` method and `reset()`; integrates with existing `src/checkpoint.js` logic
5. **Ordering**: collect keys → filter by checkpoint → confirm → delete loop → checkpoint → report
6. **Limit support**: `--limit` flag now passed to `run()` options
7. **Timeout**: configurable via `--action-min/--action-max` + `cfgTiming.timeout`; respects `cfgTiming.timeout` ms

## Implementation Decisions

1. **Module**: `src/purge.js` — new standalone module (226 lines)
2. **Interface**: `PurgeRunner.run(options)` with `type`, `timeoutMs`, `batchSize`, `maxRetries`, `backoffBase` options
3. **Adapters**: All four adapters implemented with constructor injection; `PageAdapter` takes `page` instance
4. **Checkpoint**: Uses `dataDir` + `type` for filename (`checkpoint-<type>.json`); `size()` method added
5. **Confirmation**: `ConfirmAdapter` uses `readline` for TTY prompt
6. **Reporting**: `ReporterAdapter` creates `report-<type>-<timestamp>.json` with full metadata
7. **Browser lifecycle**: remains in `cli.js` — PurgeRunner receives ready page
8. **State reporting**: `PurgeResult` includes `{ type, deleted, processed, durationMs, reportPath }`

## Testing Decisions

- **Good test**: Exercise `run()` via adapters. Verify sequence: collect → filter skipped → delete → checkpoint → report. Use in-memory adapters (fake Page, Set-backed Checkpoint, array Reporter) to avoid I/O.
- **Modules tested**: `PurgeRunner` class in `src/purge.js`. Test cases: happy path (10 items, batch 5), timeout during loop, rate limit retry, empty-scroll termination, Ctrl+C cancellation, limit reached.
- **Before**: No unit tests existed. Testing required running `npm run purge` with real browser — slow, flaky, incomplete coverage.
- **After**: One test file `tests/purge.test.js` with in-memory adapters. Each test creates synthetic page returning predefined key lists and deletion results.

## Out of Scope

1. Refactoring `src/browser.js` or `src/linkedin-dom.js` — DOM selectors unchanged.
2. Adding new action types (likes/comments → reposts).
3. Network call logging or telemetry.
4. Parallel deletion (single-threaded loop only).
5. User interface beyond CLI arguments.
6. Support for non-LinkedIn sites.
7. Migration of existing checkpoint files (backward compatibility not required).

## Further Notes

- The deletion test confirms this is a deepening opportunity: deleting `PurgeRunner` would not make `cli.js` work; it would need its own rewrite.
- "One adapter means a hypothetical seam. Two adapters means a real one." We have three adapters now, so this is a real seam.
- The domain model should be updated with "Purge Run", "Purge Item", and "ConfirmAdapter" once the spec is accepted.