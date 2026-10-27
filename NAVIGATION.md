# Navigation Index

Quick pointer to the main modules in this repo. Read this first when onboarding or exploring.

> **Coding standards** for how modules should be structured: see [`CODING_STANDARDS.md`](CODING_STANDARDS.md).

## Entry Points

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `src/cli.js` | CLI entrypoint — delegates to `src/cli/` | |
| `src/cli/index.js` | Command dispatcher (`main()`); prints help | `main()` |
| `src/purge.js` | **Purge Run** domain module — exports the four adapters and `PurgeRunner` | `PurgeRunner`, `PageAdapter`, `CheckpointAdapter`, `ReporterAdapter`, `ConfirmAdapter` |

## CLI Modules

| Module | Purpose |
|--------|---------|
| `src/cli/login.js` | `runLogin()` — opens headed browser for LinkedIn login |
| `src/cli/scan.js` | `runScan()` — shallow by default: collects the first render of rich Purge Items (key, state, author, postHref, dateTime) per type, written as the scan envelope `data/scan-<type>.json`; `--deep` walks the whole Activity List through the Activity Loader instead |
| `src/cli/input-keys.js` | `loadInputKeys()` — loads the `--input` file, validates it is the scan JSON envelope (items[].key, falling back to keys[]), and returns its key list; anything else rejected with a named-shape error |
| `src/cli/purge.js` | `runPurge()` — full purge lifecycle (browser + `PurgeRunner`), one Purge Run per target type |
| `src/cli/status.js` | `runStatus()` — reports processed-key counts |
| `src/cli/copy-chromium-profile.js` | `runCopyChromiumProfile()` — copies Chromium profile files |

## Activity Traversal

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `src/activity-loader.js` | The one implementation of scroll-and-wait: reads the items currently rendered, performs one load step, or walks the Activity List to exhaustion (complete, or incomplete when the timeout cuts it short); also builds the scan envelope so its contract has one owner | `ActivityLoader`, `createActivityPage()`, `buildScanEnvelope()`, `POLL_INTERVAL_MS` |

## Purge Modules

| Module | Purpose |
|--------|---------|
| `src/purge/runner.js` | `PurgeRunner` class — owns the full purge lifecycle loop |
| `src/purge/targets.js` | `purgeTargets()` resolves one Purge Run target per type, each carrying the Activity List tab where its page detector matches (`comments/`, `reactions/`); `all` expands to an ordered list of runs, never a type of its own |
| `src/purge/adapters/page-adapter.js` | `PageAdapter` — wraps `page.evaluate()` calls |
| `src/purge/adapters/checkpoint-adapter.js` | `CheckpointAdapter` — persists processed-key set to disk |
| `src/purge/adapters/reporter-adapter.js` | `ReporterAdapter` — writes JSON report per run |
| `src/purge/adapters/confirm-adapter.js` | `ConfirmAdapter` — prompts user before destructive action |

> **Adapter discipline**: see [`CODING_STANDARDS.md` → Seams & Adapter Discipline](CODING_STANDARDS.md#seams--adapter-discipline).

## Supporting Modules

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `src/browser.js` | Chromium launch (with profile-lock recovery), CDP attach, DOM-helper injection, resource blocking | `launchBrowser()`, `connectCDP()`, `injectDomHelpers()`, `blockHeavyResources()`, `findChromiumBinary()` |
| `src/browser-recovery.js` | Launch-recovery decisions when the profile is locked: classify the failure, match profile-holder processes, pick the kill / retry / ask-user action | `isProfileLockFailure()`, `matchesProfile()`, `classifyHolders()`, `pickRecovery()`, `finalFailureMessage()`, `ProfileInUseError` |
| `src/linkedin-dom.js` | In-page helpers exposed as `window.LP` — scan collection, growth signal, Activity List scrolling, and deletion flows | `window.LP.isCommentsPage`, `window.LP.isReactionsPage`, `window.LP.collectKeys`, `window.LP.collectItems`, `window.LP.deleteFirstEligible`, `window.LP.readGrowthSignal`, `window.LP.scrollActivityListToBottom` |
| `src/checkpoint.js` | Legacy checkpoint I/O (absorbed into `CheckpointAdapter`) | `loadCheckpoint()`, `saveCheckpoint()`, `resetCheckpoint()` |
| `src/logger.js` | Timestamped console wrappers | `log()`, `warn()`, `err()` |

> **Note on `src/linkedin-dom.js`**: This file is injected into the browser via `page.addInitScript()`. It must remain a single self-contained file (no ES module imports). See [CODING_STANDARDS.md](CODING_STANDARDS.md#when-to-exceed-the-100-line-target) for the rationale.

## Test & Data

| Path | Purpose |
|------|---------|
| `tests/purge.test.js` | In-memory adapter tests for `PurgeRunner` (no browser/FS/TTY) |
| `tests/input-keys.test.js` | `--input` loader tests over fixture files: the scan JSON envelope contract (items[].key, keys[] fallback, rejections) |
| `tests/browser-recovery.test.js` | Launch-recovery decision tests over the pure helpers: lock-failure signatures, holder matching, action picking (no browser process is ever touched by the test) |
| `tests/activity-loader.test.js` | Activity Loader and scan envelope tests through a scripted fake page: grow-then-idle, timeout cutoff, never grows, merge/dedupe/step numbering, already-seen key hand-off, shallow and deep-partial envelope shapes (no browser) |
| `tests/purge-targets.test.js` | Purge Run target tests: which Activity List tab each type is purged on, and that `all` expands to both types |
| `scripts/check-all.js` | Recursive `node --check` across `src/` and `tests/` |
| `data/checkpoint-<type>.json` | Persisted processed-key set (resumes across runs) |
| `data/report-<type>-<timestamp>.json` | Purge run reports with item metadata |
| `data/scan-<type>.json` | Scan envelope, written by shallow and deep scans alike |

## Domain Vocabulary

See `GLOSSARY.md` for canonical terms: **Purge Run**, **Purge Item**, **Key**, **Checkpoint**, **ConfirmAdapter**, **Report Entry**, **Author**, **Activity List**, **Load Step**, **Shallow Scan**, **Deep Scan**.

## Automated Checks

| Command | What it runs |
|---------|-------------|
| `npm run check` | `scripts/check-all.js` (syntax check all files) + `tests/purge.test.js` + `tests/input-keys.test.js` + `tests/browser-recovery.test.js` + `tests/activity-loader.test.js` + `tests/purge-targets.test.js` |
| `npm run lint` | Same as `npm run check` |
| `npm run test` | `tests/purge.test.js` + `tests/input-keys.test.js` + `tests/browser-recovery.test.js` + `tests/activity-loader.test.js` + `tests/purge-targets.test.js` |
| Pre-commit hook | `npm run check` (via `.husky/pre-commit`) |
