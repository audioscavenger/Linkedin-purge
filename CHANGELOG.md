# Changelog

## Bugs

## Ideas

## Unreleased

* Added config.json, generated on first run, to persist timing and path settings.
* Fixed reactions scan undercounting (only 6 of N were collected) by using stable per-item index keys instead of shared permalink links.

## Released

* [x] 0.1.1 - Built linkedin-purge: a Node/Playwright tool to bulk-delete your own LinkedIn comments and reactions, with randomized per-action and per-batch pacing, checkpoint/resume, dry-run confirmation, and JSON reports.