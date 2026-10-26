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
| `src/cli/scan.js` | `runScan()` — collects item keys by type |
| `src/cli/purge.js` | `runPurge()` — full purge lifecycle (browser + `PurgeRunner`) |
| `src/cli/status.js` | `runStatus()` — reports processed-key counts |
| `src/cli/copy-chromium-profile.js` | `runCopyChromiumProfile()` — copies Chromium profile files |

## Purge Modules

| Module | Purpose |
|--------|---------|
| `src/purge/runner.js` | `PurgeRunner` class — owns the full purge lifecycle loop |
| `src/purge/adapters/page-adapter.js` | `PageAdapter` — wraps `page.evaluate()` calls |
| `src/purge/adapters/checkpoint-adapter.js` | `CheckpointAdapter` — persists processed-key set to disk |
| `src/purge/adapters/reporter-adapter.js` | `ReporterAdapter` — writes JSON report per run |
| `src/purge/adapters/confirm-adapter.js` | `ConfirmAdapter` — prompts user before destructive action |

> **Adapter discipline**: see [`CODING_STANDARDS.md` → Seams & Adapter Discipline](CODING_STANDARDS.md#seams--adapter-discipline).

## Supporting Modules

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `src/browser.js` | Chromium launch, CDP attach, DOM-helper injection, resource blocking | `launchBrowser()`, `connectCDP()`, `injectDomHelpers()`, `blockHeavyResources()`, `findChromiumBinary()` |
| `src/linkedin-dom.js` | In-page helpers exposed as `window.LP` — key collection & deletion flows | `window.LP.collectKeys`, `window.LP.deleteFirstEligible`, `window.LP.clickShowMoreIfPresent` |
| `src/config.js` | Defaults + file load + deep merge for timing & paths | `loadConfig()`, `saveConfig()`, `URLS`, `PATHS`, `TIMING` |
| `src/checkpoint.js` | Legacy checkpoint I/O (absorbed into `CheckpointAdapter`) | `loadCheckpoint()`, `saveCheckpoint()`, `resetCheckpoint()` |
| `src/logger.js` | Timestamped console wrappers | `log()`, `warn()`, `err()` |

> **Note on `src/linkedin-dom.js`**: This file is injected into the browser via `page.addInitScript()`. It must remain a single self-contained file (no ES module imports). See [CODING_STANDARDS.md](CODING_STANDARDS.md#when-to-exceed-the-100-line-target) for the rationale.

## Test & Data

| Path | Purpose |
|------|---------|
| `tests/purge.test.js` | In-memory adapter tests for `PurgeRunner` (no browser/FS/TTY) |
| `scripts/check-all.js` | Recursive `node --check` across `src/` and `tests/` |
| `data/checkpoint-<type>.json` | Persisted processed-key set (resumes across runs) |
| `data/report-<type>-<timestamp>.json` | Purge run reports with item metadata |

## Domain Vocabulary

See `GLOSSARY.md` for canonical terms: **Purge Run**, **Purge Item**, **Key**, **Checkpoint**, **ConfirmAdapter**.

## Automated Checks

| Command | What it runs |
|---------|-------------|
| `npm run check` | `scripts/check-all.js` (syntax check all files) + `tests/purge.test.js` |
| `npm run lint` | Same as `npm run check` |
| `npm run test` | `tests/purge.test.js` only |
| Pre-commit hook | `npm run check` (via `.husky/pre-commit`) |
