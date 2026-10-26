# Changelog

## Bugs

## Ideas

## Unreleased

* [x] Enriched scan output with rich per-item metadata
  - Each like/comment in `data/scan-<type>.json` now includes `state` (for likes), `author` (post author), `postHref` (when available), and `dateTime` (post date).
  - New `window.LP.collectItems()` helper in `linkedin-dom.js` walks each list-item card and extracts its metadata (author from the "Open control menu for post by X" button aria-label, date from the Month+Day text inside the card).
* [x] Added `purge --input <file>` to purge only keys from a filtered scan JSON file.
  - PurgeRunner now accepts `inputKeys` and restricts deletion to the provided set (in addition to checkpoint filtering).
  - PageAdapter.deleteFirstEligible accepts `allowedKeys` and skips any key not in that set.
  - LoadInputKeys supports scan output shape (`items[].key`, `keys[]`, bare arrays).

## Released

* [x] 0.3.3 - Enriched scan output with rich per-item metadata (state/author/postHref/dateTime via collectItems); added `purge --input <file>` to purge only from a filtered scan JSON file (PurgeRunner inputKeys + PageAdapter allowedKeys).
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