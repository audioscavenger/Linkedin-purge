# 12: Page selection: rows, master checkbox, counts

**What to build:** Each row has a checkbox, a master checkbox selects every row matching the current filter and only those, and the page always shows how many rows are selected, how many match the filter and how many exist in total.

**Blocked by:** 11

**Status:** waiting

**Touches:** the generator template and the browser check harness.

**Do not touch:** the scan command, the purge module.

- [ ] Ticking rows updates the counts immediately
- [ ] The master checkbox selects exactly the filtered rows and never rows excluded by a filter
- [ ] Unticking the master clears the current selection
- [ ] The browser check asserts counts and the filtered-select-all behaviour
- [ ] `npm run check` passes
