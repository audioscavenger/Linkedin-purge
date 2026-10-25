# Changelog

## Bugs

## Ideas

## Unreleased

* Fixed reactions scan undercounting (only 6 of N were collected) by using stable per-item index keys instead of shared permalink links.
* Added config.json, generated on first run, to persist timing and path settings.
* Enriched report entries with state, author, postHref and dateTime metadata for selective deletion filtering.
* Fixed scan: scroll #workspace container instead of window/body; headless default for scan.

## Released

* [x] 0.1.1 - Built linkedin-purge: a Node/Playwright tool to bulk-delete your own LinkedIn comments and reactions, with randomized per-action and per-batch pacing, checkpoint/resume, dry-run confirmation, and JSON reports.