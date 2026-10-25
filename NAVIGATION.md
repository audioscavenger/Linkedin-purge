# Navigation Index

Quick pointer to the main modules in this repo. Read this first when onboarding or exploring.

## Entry Points

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `src/cli.js` | CLI orchestrator — parses flags, launches browser, delegates to PurgeRunner | `runPurge()`, `runScan()`, `runLogin()`, `runStatus()`, `runCopyChromiumProfile()` |
| `src/purge.js` | **Purge Run** domain module — owns the full purge lifecycle behind a small interface | `PurgeRunner`, `PageAdapter`, `CheckpointAdapter`, `ReporterAdapter`, `ConfirmAdapter` |

## Supporting Modules

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `src/browser.js` | Chromium launch, CDP attach, DOM-helper injection, resource blocking | `launchBrowser()`, `connectCDP()`, `injectDomHelpers()`, `blockHeavyResources()`, `findChromiumBinary()` |
| `src/linkedin-dom.js` | In-page helpers exposed as `window.LP` — key collection & deletion flows | `window.LP.collectKeys`, `window.LP.deleteFirstEligible`, `window.LP.clickShowMoreIfPresent` |
| `src/config.js` | Defaults + file load + deep merge for timing & paths | `loadConfig()`, `saveConfig()`, `URLS`, `PATHS`, `TIMING` |
| `src/checkpoint.js` | Legacy checkpoint I/O (absorbed into `CheckpointAdapter` in `purge.js`) | `loadCheckpoint()`, `saveCheckpoint()`, `resetCheckpoint()` |
| `src/logger.js` | Timestamped console wrappers | `log()`, `warn()`, `err()` |

## Test & Data

| Path | Purpose |
|------|---------|
| `tests/purge.test.js` | In-memory adapter tests for `PurgeRunner` (no browser/FS/TTY) |
| `data/checkpoint-<type>.json` | Persisted processed-key set (resumes across runs) |
| `data/report-<type>-<timestamp>.json` | Purge run reports with item metadata |

## Domain Vocabulary

See `GLOSSARY.md` for canonical terms: **Purge Run**, **Purge Item**, **Key**, **Checkpoint**, **ConfirmAdapter**.