# Changelog

## Bugs

## Ideas

## Unreleased

* [x] 0.3.0 - Refactored large files (cli.js, purge.js, linkedin-dom.js) into smaller, more manageable modules with separation of concerns for better maintainability and testability.
    * Added `npm run health` to check syntax, tests, and pre-commit hook status at a glance.
    * Added comprehensive syntax check (`scripts/check-all.js`) covering all files under `src/` and `tests/` automatically.
    * Wired Husky pre-commit hook: `npm run check` + `npm run test` now run automatically before each commit.
    * Updated `NAVIGATION.md` and `CODING_STANDARDS.md` with cross-references for easier onboarding and standards enforcement.

## Released

* [x] 0.2.0 - Enriched reports with state/author/dateTime/postHref metadata for selective deletion filtering; added configurable timeout to scan/purge; headless scan by default; scroll #workspace container instead of window/body; stable index keys for reactions scan.
    * Reactions scan now collects all items instead of only ~6.
    * config.json is generated on first run to persist timing and path settings.
    * Report entries include state, author, postHref, and dateTime.
    * Timeout (default 1h) applied to scan and purge loops.
* [x] 0.1.1 - Built linkedin-purge: a Node/Playwright tool to bulk-delete your own LinkedIn comments and reactions, with randomized per-action and per-batch pacing, checkpoint/resume, dry-run confirmation, and JSON reports.