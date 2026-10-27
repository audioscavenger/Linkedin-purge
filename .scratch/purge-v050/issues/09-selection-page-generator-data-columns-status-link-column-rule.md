# 09: Selection page generator: data, columns, status, link column rule

**What to build:** A pure function turns an envelope into a complete, self-contained HTML page with the data embedded, written to `data/selection-<type>.html`. The table shows checkbox, reaction state, author, date, item text or post excerpt, and status; the link column exists only when at least one item has a link, with empty cells for items without one. No Card Identity or Key is rendered.

**Blocked by:** 05

**Status:** waiting

**Touches:** a new page generator module with its template, and its test.

**Do not touch:** the scan command (a later ticket wires it), the purge module, the injected helpers.

- [ ] The generator returns HTML containing the envelope as embedded data, with no external requests
- [ ] The table renders state, author, date, text or excerpt, and status for every item
- [ ] The link column is absent when no item has a link, and present with empty cells when some do
- [ ] Neither `cardId` nor the item key appears anywhere in the output
- [ ] User-supplied text is HTML-escaped
- [ ] A test asserts each of the above from a fixture envelope
- [ ] `npm run check` passes
