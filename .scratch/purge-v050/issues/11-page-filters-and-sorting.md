# 11: Page filters and sorting

**What to build:** The page can narrow the table by reaction state (multiselect), author (case-insensitive contains) and date range, and sort by date or author. Filtering is instant and the visible row count follows the filter.

**Blocked by:** 10

**Status:** waiting

**Touches:** the generator template and the browser check harness.

**Do not touch:** the scan command, the purge module.

- [ ] State, author and date filters combine and immediately change the visible rows
- [ ] Sorting by date and by author reorders the table
- [ ] An empty result shows a clear empty state rather than a blank table
- [ ] The browser check asserts a filtered row count and one sorted order
- [ ] `npm run check` passes
