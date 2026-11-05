# Changelog

## Bugs

## Ideas

## Unreleased

## Unreleased

* [ ] 0.5.0 - Review-first purge: scan, review on a generated page, select, purge a selection, statuses on the page; Card Identity replaces drift-prone keys; `--links` captures item/post links; the scan envelope is the only state, retiring checkpoint and report.
    * Test runner prefactor: one script runs every file under `tests/`, so adding a test file never edits `package.json` again (`npm run test`/`check`/`health` share it).
    * Purge Status vocabulary: five named statuses (`no-op`, `pending`, `purged`, `failed`, `not-found`) with a finality check, so a typo cannot invent a sixth value.
    * Card Identity from the card container: every item carries `cardId` read from the card's own container element id, stable across page loads; the live page check asserts it on both tabs.
    * In-page comment text and post excerpt: comment items carry `text` (truncated to 280 with an ellipsis), reaction items carry `null`; every item carries `postExcerpt` (truncated to 140), null when the card has no post body.
    * Scan envelope starts every item as `no-op`: a fresh scan states plainly that nothing is chosen or acted on; an item that already carries a status keeps it.
    * `--links` plumbing: CLI flag (also `behavior.links` in config, CLI wins, default off) reaches the page seam as an option; the help screen states the measured cost of about one second per item.
    * In-page link capture through the card menu: each item gets `itemHref` and `postHref` by opening the card's control menu and capturing the URL from the page's own clipboard write; menu polling with one retry.
    * Scan prints a short summary per type: items found, first-render count, load steps, completeness, link-bearing count (when `--links`), and elapsed time.
    * Selection page generator: a pure function turns an envelope into a self-contained HTML page with the data embedded, written to `data/selection-<type>.html`; table shows checkbox, state, author, date, text or excerpt, and status; the link column appears only when at least one item has a link.
    * Browser check harness for the generated page: opens a generated page in Chromium and asserts the table renders from the embedded data (`npm run verify:selection-page`, not part of `check`/`health`).
    * Page filters and sorting: narrow the table by reaction state (multiselect), author (case-insensitive contains) and date range; sort by date or author; empty result shows a clear empty state.
    * Page selection: each row has a checkbox, a master checkbox selects exactly the rows matching the current filter, and the page always shows how many rows are selected, how many match the filter and how many exist in total.
    * Page export: an Export button downloads `selection-<type>.json` holding only the ticked items at `status: pending`, with narrowed `count`/`keys`, `scannedAt` preserved and `selectedAt` added; exporting with nothing ticked is refused with a visible message.
    * Scan generates the page, prints its path and opens it: after each type the scan writes `data/selection-<type>.html`, adds the relative path to its summary, and opens it in the OS default browser (best effort).
    * Envelope store with per-item marks: one module owns the scan envelope file, marks one item's status by Card Identity with an atomic write on the spot, and answers counts by status.
    * Status transition rules: `purged` is final; `pending`, `failed` and `not-found` are retried; `no-op` is never acted on.
    * Purge walks, matches and stops early: reads a selection, walks the Activity List through the load-step operation, matches cards by Card Identity, acts on selected items that are not already `purged`, and stops the moment every selected item is final; writes `purged` on success, `failed` on refusal, through the store.
    * Purge marks not-found and retries what is not final: an unmatched selection ends as `not-found` reported by identity; a second run acts again on `pending`, `failed` and `not-found`, and skips `purged` items.
    * Purge command reads a selection and drives the runner: `purge --input <selection>` acts on the selection and prints counts by status at the end; a selection with nothing actionable exits without prompting; the command no longer wires a checkpoint or a report writer.
    * `--reset-checkpoint` is refused loudly and removed from the help screen.
    * Deleted the checkpoint and report code: the checkpoint store, its adapter, the report writer adapter and their exports are gone; no code path writes a checkpoint file or a date-stamped report; old `data/checkpoint-*.json` and `data/report-*.json` files are ignored.
    * ADR 0003 records the client-side Selection Page (static file, embedded data, browser download, no picker, no server); ADR 0004 records the scan envelope as the only state, retiring checkpoint and report.
    * README and navigation document the new flow (scan, review, select, export, purge, statuses on the page) and list the new modules, no longer listing the retired ones.
    * GLOSSARY keeps Selection and Purge Status, retires Checkpoint and Report Entry, and makes the Key versus Card Identity distinction plain.

## Released

* [x] 0.4.0 - Full activity walk restored as `scan --deep`, a purge that finds its own tab, and a live check that catches LinkedIn markup changes.
    * Browser launch recovers from locked profiles: kills leftover headless/CDP browser instances from previous runs and retries the launch; when a browser you have open holds the profile, it says so in one line (with the PIDs) instead of dumping the Playwright launch log.
    * Restored the full activity walk as `scan --deep`, with a polling load step, an honest scan envelope, and purge visiting the tab of the type it purges.
    * Plain `scan` still collects the first render only (about 20 cards per tab); `scan --deep` walks the whole Activity List and stops when the list stops growing. Deep is opt-in: `--deep` on the command line, or `behavior.deepScan` in `config.json`, default false.
    * A load step is a growth deadline, not a fixed sleep: read the growth signal, scroll the Activity List to its bottom, then poll until it grows or `timing.growthWait` expires. The key is `growthWait` (renamed from `scrollWait` before the first release, because it no longer describes a sleep) and its default rises from 800 to 3000, so eight fruitless steps mean about 24 seconds of silence before the end is declared. The poll interval is a fixed 300 ms because it is machine latency, not user preference.
    * The scan envelope adds per-item `step` (the load step a card first appeared in, zero-based, 0 for every item of a shallow scan), plus top-level `steps` and `complete`. A walk cut short by `timing.timeout` still writes its file, marked `complete: false`, and warns. Every pre-existing field keeps its meaning, so old and new files both load through `purge --input`.
    * Only cards not yet seen get their metadata extracted, so a deep walk stays linear as the page grows, and nothing inside a card is clicked: scrolling alone paginates both tabs.
    * The walk lives in one module, `ActivityLoader`, with a thin page seam for tests, `createActivityPage()` for the browser edge, and a pure `buildScanEnvelope()` in its own module that owns the file contract. Covered by a browser-free test file over a scripted fake page.
    * Purge navigates to the tab matching the type it purges: the activity "all" tab matched neither page detector, so purge collected zero keys and reported "cancelled or nothing to delete" against a full history. Purge still acts on what is on the page and does not walk.
    * The in-page note about reaction keys now records what was measured: an unliked card keeps its place within the page session and disappears on reload, so reaction indices are session-scoped, not stable across runs.
    * `purge --type all` writes per-type checkpoints and reports: the aggregate type used to reach the adapters, so the run produced a `checkpoint-all.json` that nothing ever resumes from and one `report-all-<ts>.json` instead of a report per type. Each run now carries its concrete type and its own Activity List tab.
    * A deep walk reconciles a late batch: cards that land between one step's last poll and the next step's first growth read are read once before the step counts toward the idle limit, so a file marked `complete: true` cannot silently omit a whole batch. A `timing.timeout` of `0` is no time limit now, matching `--limit 0`, instead of stopping the walk after the first render; `null` still falls back to the one-hour default.
    * `npm run verify:page` checks the injected page helpers against the live activity tabs, so a LinkedIn markup change fails loudly with the helper's name instead of a scan of 0 items, a scroll target of nothing, or a growth signal that never moves.
    * Asserts tab recognition, the growth signal shape, the named scroll target plus real pagination, the item metadata, unique keys and the incremental seen-key contract on both tabs. Every page call is bounded, so a hung evaluate fails with the helper's name and the step instead of hanging the command.
    * Not part of `npm run check`, `lint` or `health`: it opens LinkedIn with your own profile and needs a logged-in session (`npm run login` first). The assertions live in `src/page-check.js`, unit-tested through a fake page seam; `scripts/verify-page.js` is only the browser wiring.
    * Running the check live found and fixed a permanently null `lastKey` in the growth signal (the Activity List ends with tiles that carry no key), and proved the pagination assertion has to count cards rather than scroll height: a 40 px layout shift passed the first version with no new cards.
    * A stalled or killed deep walk is still a known gap: the walk writes its file only at the end, and a 300-plus-card comments list stalled once with no diagnostics. Parked in `.scratch/deep-scan-scale/issue.md`.
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
