# Changelog

## Bugs

## Ideas

## Unreleased

* [x] Browser launch recovers from locked profiles: kills leftover headless/CDP browser instances from previous runs and retries the launch; when a browser you have open holds the profile, it says so in one line (with the PIDs) instead of dumping the Playwright launch log.
* [x] Restored the full activity walk as `scan --deep`, with a polling load step, an honest scan envelope, and purge visiting the tab of the type it purges.
    * Plain `scan` still collects the first render only (about 20 cards per tab); `scan --deep` walks the whole Activity List and stops when the list stops growing. Deep is opt-in: `--deep` on the command line, or `behavior.deepScan` in `config.json`, default false.
    * A load step is a growth deadline, not a fixed sleep: read the growth signal, scroll the Activity List to its bottom, then poll until it grows or `timing.scrollWait` expires. `scrollWait` keeps its name and rises from 800 to 3000, so eight fruitless steps mean about 24 seconds of silence before the end is declared. The poll interval is a fixed 300 ms because it is machine latency, not user preference.
    * The scan envelope adds per-item `step` (the load step a card first appeared in, zero-based, 0 for every item of a shallow scan), plus top-level `steps` and `complete`. A walk cut short by `timing.timeout` still writes its file, marked `complete: false`, and warns. Every pre-existing field keeps its meaning, so old and new files both load through `purge --input`.
    * Only cards not yet seen get their metadata extracted, so a deep walk stays linear as the page grows, and nothing inside a card is clicked: scrolling alone paginates both tabs.
    * The walk lives in one module, `ActivityLoader`, with a thin page seam for tests, `createActivityPage()` for the browser edge, and a pure `buildScanEnvelope()` that owns the file contract. Covered by a browser-free test file over a scripted fake page.
    * Purge navigates to the tab matching the type it purges: the activity "all" tab matched neither page detector, so purge collected zero keys and reported "cancelled or nothing to delete" against a full history. Purge still acts on what is on the page and does not walk.
    * The in-page note about reaction keys now records what was measured: an unliked card keeps its place within the page session and disappears on reload, so reaction indices are session-scoped, not stable across runs.

## Released

* [x] 0.3.4 - Standards fixes for the v0.3.3 release: records of destructive actions are now correct and single-sited, the Report Entry has one owner, and the purge input format is a named contract (ADR 0001).
    * One canonical card-metadata extraction runs on the card before the destructive click and serves both delete flows; reaction and comment deletions both record state, author, postHref, and dateTime, with author = the post author, never the purged account.
    * Eligibility (not yet processed, and in the input set when one is given) is computed once in the runner; the page adapter does membership over the precomputed eligible-key list only.
    * The reporter adapter owns the Report Entry: it stamps the action timestamp (ts) and writes the canonical field set (key, ts, state, author, postHref, dateTime).
    * `purge --input` accepts exactly the scan JSON envelope (items[].key, falling back to keys[]) and fails loudly with a named-shape error on anything else; recorded as ADR 0001.
    * Changelog history corrected: the 0.3.2 entry is restored verbatim above a 0.3.3 entry trimmed to its own two bullets.
    * GLOSSARY.md and NAVIGATION.md refreshed: Purge Item carries its card metadata, Report Entry and Author are defined, and the in-page export list is complete.
* [x] 0.3.3 - Enriched scan output with per-item card metadata and added purge-from-a-filtered-file.
    * Enriched scan output with rich per-item metadata (state/author/postHref/dateTime via collectItems).
    * Added `purge --input <file>` to purge only from a filtered scan JSON file.
* [x] 0.3.2 - Fixed status.js `path` error, scan.js linkedin-dom.js not-found, `/me/` username detection, `--headless` default for each command; wired CLI parameters (profile-dir, data-dir, chromium-path, limit, headless, action-min/max, batch-min/max, reset-checkpoint) to config.json with CLI > config.json > built-in default precedence.
    * New src/cli/config.js centralizes flag resolution.
    * config.json now includes paths.dataDir and a behavior section (headless, limit, resetCheckpoint).
    * purge.js passes all timing options (actionMin/Max, batchMin/Max, timeoutMs, batchSize, maxRetries, maxEmptyScrolls, backoffBase) through to PurgeRunner.
    * scan.js defaults to headless=true, purge/login default to headless=false.
* [x] 0.3.1 - Added a `--help` / `-h` flag and an `npm run help` usage screen showing the full parameter reference (with defaults) and copy-paste examples.
    * `--help` / `-h` is honored from any argument position, for any command.
    * Readme Parameters and Development sections now document it; `npm run help` script added.
* [x] 0.3.0 - Refactored large files (cli.js, purge.js, linkedin-dom.js) into smaller, more manageable modules with separation of concerns for better maintainability and testability.
    * Added `npm run health` to check syntax, tests, and pre-commit hook status at a glance.
    * Added comprehensive syntax check (`scripts/check-all.js`) covering all files under `src/` and `tests/` automatically.
    * Wired Husky pre-commit hook: `npm run check` + `npm run test` now run automatically before each commit.
    * Updated `NAVIGATION.md` and `CODING_STANDARDS.md` with cross-references for easier onboarding and standards enforcement.
* [x] 0.2.0 - Enriched reports with state/author/dateTime/postHref metadata for selective deletion filtering; added configurable timeout to scan/purge; headless scan by default; scroll #workspace container instead of window/body; stable index keys for reactions scan.
    * Reactions scan now collects all items instead of only ~6.
    * config.json is generated on first run to persist timing and path settings.
    * Report entries include state, author, postHref, and dateTime.
    * Timeout (default 1h) applied to scan and purge loops.
* [x] 0.1.1 - Built linkedin-purge: a Node/Playwright tool to bulk-delete your own LinkedIn comments and reactions, with randomized per-action and per-batch pacing, checkpoint/resume, dry-run confirmation, and JSON reports.
