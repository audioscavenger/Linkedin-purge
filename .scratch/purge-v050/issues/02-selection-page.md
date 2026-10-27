# 02: Selection Page, generated and opened after a scan

**What to build:** A scan produces a page the user can read and act on, with no file picking and no server.

- After each type, the scan writes `data/selection-<type>.html` (fixed name, overwritten every scan), with the envelope embedded as data, then prints a short summary and that relative path, and opens the page in the **OS default browser**. Opening is best effort: a failure prints the path and never fails the scan.
- The page shows a table: checkbox, reaction state, author, date, comment text or post excerpt, a status column, and a link column. The link column exists only when at least one item has a link; items without one get an empty cell, and the column disappears entirely for a link-free scan.
- Filters: reaction state as a multiselect, author as case-insensitive contains, and a date range. Sorting by date and by author.
- A master checkbox selects every row matching the current filter and only those; counts of selected, matching and total are always visible.
- Export downloads `selection-<type>.json`, an envelope holding only the ticked items with `status: pending`, `count` and `keys` narrowed to them, `scannedAt` preserved and `selectedAt` added. No timestamp in the file name.
- Cards and Keys are internals: neither is displayed.

**Blocked by:** 01 (the envelope fields the page displays)

**Status:** ready-for-agent

**Touches:** a new page-generator module and template, a new default-browser opener module, the scan command (generate, summarise, open), a new generator test file, a new live page test, and the package test lists.

**Do not touch:** the purge module, the injected in-page helpers, `README.md`, `NAVIGATION.md`, `GLOSSARY.md`, `docs/adr/`, or `CHANGELOG.md`. Do not write a changelog entry.

- [ ] A scan leaves exactly one page per type at the fixed path, containing that scan's data, and prints the summary and the relative path
- [ ] The page opens in the OS default browser, not the automation browser; a launch failure is non-fatal and leaves the printed path
- [ ] The table shows state, author, date, item text or post excerpt and status, with no Card Identity or Key visible
- [ ] The link column is absent when no item has a link, and shows empty cells (not placeholders) for items without one when present
- [ ] State, author and date filters combine, and the master checkbox selects only the filtered rows, with counts always visible
- [ ] Export produces a selection envelope with the ticked items, `status: pending`, narrowed counts and keys, and the source `scannedAt`
- [ ] A browser test opens the generated page, filters, ticks, uses select-all, exports, and asserts the downloaded file equals the expected selection envelope
- [ ] `npm run test` and `npm run check` pass
