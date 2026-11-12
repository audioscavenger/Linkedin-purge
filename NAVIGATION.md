# Navigation Index

Quick pointer to the main modules in this repo. Read this first when onboarding or exploring.

> **Coding standards** for how modules should be structured: see [`CODING_STANDARDS.md`](CODING_STANDARDS.md).

## Entry Points

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `src/cli.mjs` | CLI entrypoint - delegates to `src/cli/` | |
| `src/cli/index.mjs` | Command dispatcher (`main()`); prints help | `main()` |
| `src/purge.mjs` | **Purge Run** domain module - exports `PurgeRunner`, `PageAdapter`, `ConfirmAdapter`; the only purge barrel (there is no `src/purge/index.mjs`) | `PurgeRunner`, `PageAdapter`, `ConfirmAdapter` |

## CLI Modules

| Module | Purpose |
|--------|---------|
| `src/cli/dashboard.mjs` | `runDashboard()` - starts the dashboard HTTP server | `runDashboard()` |
| `src/server.mjs` | Local HTTP server (`createServer()`) for the live dashboard API, REST endpoints, and SSE stream | `createServer()`, `stopServer()`, `resolveDashboardPort()` |
| `src/dashboard-page.mjs` | HTML generator for the live dashboard single-page UI | `generateDashboardPage()` |
| `src/cli/scan.mjs` | `runScan()` - shallow by default: collects the first render of rich items (key, cardId, state, author, postHref, dateTime, text, postExcerpt, cardId) per type, written as the scan envelope `data/scan-<type>.json`; `--deep` walks the whole Activity List through the Activity Loader instead, then writes and opens `data/selection-<type>.html` |
| `src/cli/input-keys.mjs` | `loadInputKeys()` - loads the `--input` file, validates it is the scan JSON envelope (items[].key, falling back to keys[]), and returns its key list; anything else rejected with a named-shape error |
| `src/cli/selection.mjs` | `loadSelection()` - loads a `selection-<type>.json` export envelope and answers which items are actionable (anything not final and not a no-op), keyed by Card Identity |
| `src/cli/purge.mjs` | `runPurge()` - full purge lifecycle (Activity Session + `PurgeRunner`), one Purge Run per Activity target; with `--input` it acts on a selection envelope and writes each item's status into it |
| `src/cli/status.mjs` | `runStatus()` - reports per-type counts by status from the scan envelope |
| `src/cli/login-import-profile.mjs` | `runLoginImportProfile()` - imports a logged-in Chromium profile into `.profile-chromium/`. |

## Activity Traversal

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `src/activity-session.mjs` | The browser bootstrap both commands share: launch or CDP attach, page, helper injection, both login guards, the `/in/me` base URL and per-target tab navigation; one session per invocation, closed in a `finally`; a lapsed session throws `SessionExpiredError` (friendly, exit 1) | `ActivitySession`, `SessionExpiredError` |
| `src/activity-loader.mjs` | The one implementation of scroll-and-wait: reads the items currently rendered, reads the first render as one complete step, performs one load step, or walks the Activity List to exhaustion (complete, or incomplete when the timeout cuts it short); reads the unseen cards once per step, so a batch that lands between steps is still collected | `ActivityLoader`, `createActivityPage()`, `POLL_INTERVAL_MS` |
| `src/activity-targets.mjs` | `activityTargets()` resolves one Activity target per type: a concrete type plus the Activity List tab where its page detector matches (`comments/`, `reactions/`). Shared by scan and purge, so the two commands cannot disagree about a tab; `all` expands to an ordered list of targets, never a type of its own | `activityTargets()` |
| `src/scan-envelope.mjs` | The `data/scan-<type>.json` file contract: a pure builder that keeps the pre-existing fields and adds per-item `step` plus top-level `steps` and `complete`, so `purge --input` reads old and new files (ADR 0001) | `buildScanEnvelope()` |
| `src/page-check.mjs` | Live check of the injected `window.LP` helpers at the real boundary: tab recognition, growth signal, scroll target plus real pagination, item metadata, unique keys and the seen-key contract, one named result per assertion; every page call is bounded so a hung evaluate fails instead of hanging, and the checks run against a fake page seam in tests | `checkActivityTab()`, `createCheckPage()`, `describeTarget()` |

## Purge Modules

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `src/purge/runner.mjs` | `PurgeRunner` class - owns the full purge lifecycle loop: selection mode acts on selected items by Card Identity and stops when every selected item is final; full-purge mode walks and acts on every collected card | `PurgeRunner()` |
| `src/purge/adapters/page-adapter.mjs` | `PageAdapter` - wraps `page.evaluate()` calls | `collectKeys()`, `oneCardAct(cardId)`, `loadStep()`, `wait()` |
| `src/purge/adapters/confirm-adapter.mjs` | `ConfirmAdapter` - prompts user before destructive action | `confirm()` |
| `src/envelope-store.mjs` | Owns the scan envelope file: loads it, marks one item's Purge Status by Card Identity (atomic write on the spot), and answers counts by status | `EnvelopeStore()`, `mark()`, `counts()`, `load()` |

> **Adapter discipline**: see [`CODING_STANDARDS.md` → Seams & Adapter Discipline](CODING_STANDARDS.md#seams--adapter-discipline).

## Supporting Modules

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `src/browser.mjs` | Chromium launch (with profile-lock recovery), CDP attach, DOM-helper injection, resource blocking | `launchBrowser()`, `connectCDP()`, `injectDomHelpers()`, `blockHeavyResources()`, `findChromiumBinary()` |
| `src/browser-recovery.mjs` | Launch-recovery decisions when the profile is locked: classify the failure, match profile-holder processes, pick the kill / retry / ask-user action | `isProfileLockFailure()`, `matchesProfile()`, `classifyHolders()`, `pickRecovery()`, `finalFailureMessage()`, `ProfileInUseError` |
| `src/login-guard.mjs` | The one login, checkpoint and authwall URL test: the Activity Session calls it at every point a run comes back from a navigation, so a session that expires between tabs stops the run | `isLoggedOut()` |
| `src/linkedin-dom.mjs` | In-page helpers exposed as `window.LP` - scan collection, growth signal, Activity List scrolling, card-identity capture, link capture through the card menu, and one-card delete by Card Identity | `window.LP.isCommentsPage`, `window.LP.isReactionsPage`, `window.LP.collectKeys`, `window.LP.collectItems`, `window.LP.deleteOneCard`, `window.LP.readGrowthSignal`, `window.LP.scrollActivityListToBottom` |
| `src/logger.mjs` | Timestamped console wrappers | `log()`, `warn()`, `err()` |

> **Note on `src/linkedin-dom.mjs`**: This file is injected into the browser via `page.addInitScript()`. It must remain a single self-contained file (no ES module imports). See [CODING_STANDARDS.md](CODING_STANDARDS.md#when-to-exceed-the-100-line-target) for the rationale.

## Test & Data

| Path | Purpose |
|------|---------|
| `tests/purge.test.mjs` | In-memory adapter tests for `PurgeRunner` (no browser/FS/TTY) |
| `tests/selection.test.mjs` | Selection loader tests over fixture files: Card Identity preferred over key, actionable filter, strict errors |
| `tests/input-keys.test.mjs` | `--input` loader tests over fixture files: the scan JSON envelope contract (items[].key, keys[] fallback, rejections) |
| `tests/browser-recovery.test.mjs` | Launch-recovery decision tests over the pure helpers: lock-failure signatures, holder matching, action picking (no browser process is ever touched by the test) |
| `tests/browser-opener.test.mjs` | Default-browser opener tests over scripted success/failure (no browser opened) |
| `tests/reset-checkpoint.test.mjs` | `--reset-checkpoint` is refused loudly and no browser launches |
| `tests/activity-loader.test.mjs` | Activity Loader tests through a scripted fake page: grow-then-idle, timeout cutoff, timeout 0 as no limit, absent timeout as the one-hour default, never grows, merge/dedupe/step numbering, already-seen key hand-off, a silently landing late batch, the first-render operation (no browser) |
| `tests/activity-session.test.mjs` | Activity Session tests through injected fakes: base URL from the profile slug and its `me` fallback, the tab navigation on the derived base URL, both login guards (throw, friendly, close), the CDP attach path, the two settle waits and idempotent close (no browser, no sleeping) |
| `tests/scan-envelope.test.mjs` | Scan envelope builder tests: the shallow shape (one step, complete, every item step 0) and the deep-partial shape (many steps, incomplete) |
| `tests/activity-targets.test.mjs` | Activity target tests: which Activity List tab each type lives on, that `all` expands to both types, and that an unknown type is rejected |
| `tests/page-check.test.mjs` | Live page-helper check tests through a scripted fake page seam (no browser): both tabs passing, and one named failure each for bad tab detection, a dead growth signal, no pagination, missing metadata, duplicate keys, leaked seen keys, a hung call and a throwing call, plus the failure-message shape |
| `tests/login-guard.test.mjs` | Login guard tests: login, checkpoint and authwall URLs count as logged out, real pages do not, and the URL is read at call time |
| `tests/one-card-delete.test.mjs` | One-card delete by Card Identity tests through a fake DOM: success, named refusal, unknown card is not-found, list-shaped `deleteFirstEligible` is gone |
| `scripts/check-all.mjs` | Recursive `node --check` across `src/` and `tests/` |
| `scripts/selection-page-browser-check.mjs` | Opens a generated selection page headless and asserts the table renders from embedded data, filters/sort/master-select behave, and Export downloads the expected envelope; not part of `check` or `health` |
| `scripts/probe-dom.mjs` | DOM probe: launches headed with your logged-in profile, opens the comments or reactions tab (first page only, no scroll), dumps per-card links/times/text candidates/headline candidates/text blocks so exact author/headline/date/text selectors can be written for `src/linkedin-dom.mjs`. One script for both tabs via a type argument. Carries a `LAST VERIFIED WORKING` date — LinkedIn markup obfuscates per deploy. |
| `scripts/dump-card.mjs` | Dumps full outerHTML of one comment card to `/tmp/card-outer.html` plus every text node with tag and classes, for discovering comment text/date/headline selectors. Read-only, no scroll. |
| `data/scan-<type>.json` | Scan envelope, written by shallow and deep scans alike; now the only state, carrying per-item Purge Status |
| `data/selection-<type>.html` | Selection page written and opened after each scan, with the envelope embedded inline |
| `data/selection-<type>.json` | Selection envelope downloaded by Export: only ticked items at `status: pending`, narrowed `count`/`keys`, `scannedAt` preserved, `selectedAt` added |

## Domain Vocabulary

See `GLOSSARY.md` for canonical terms: **Purge Run**, **Purge Item**, **Key** (session-scoped; points to Card Identity), **Card Identity**, **Purge Status**, **Selection**, **Author**, **Activity List**, **Load Step**, **Shallow Scan**, **Deep Scan**.

## Automated Checks

| Command | What it runs |
|---------|--------------|
| `npm run check` | `scripts/check-all.mjs` (syntax check all files) + `tests/purge.test.mjs` + `tests/input-keys.test.mjs` + `tests/browser-recovery.test.mjs` + `tests/activity-loader.test.mjs` + `tests/scan-envelope.test.mjs` + `tests/activity-targets.test.mjs` + `tests/login-guard.test.mjs` + `tests/page-check.test.mjs` |
| `npm run lint` | `eslint .` via the flat config in `eslint.config.mjs` |
| `npm run test` | `tests/purge.test.mjs` + `tests/input-keys.test.mjs` + `tests/browser-recovery.test.mjs` + `tests/activity-loader.test.mjs` + `tests/scan-envelope.test.mjs` + `tests/activity-targets.test.mjs` + `tests/login-guard.test.mjs` + `tests/page-check.test.mjs` |
| `npm run verify:page` | Live check of the injected `window.LP` helpers against both Activity tabs (a browser and a logged-in profile); not part of `check`, `lint` or `health` |
| `npm run verify:selection-page` | Opens a generated selection page headless and asserts it renders, filters/sort/master-select behave, and Export downloads the expected envelope; not part of `check`, `lint` or `health` |
| Pre-commit hook | lint-staged: `eslint --fix` + `prettier --write` on staged JS files (via `.husky/pre-commit`) |
