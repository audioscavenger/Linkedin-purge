# 08: Scan prints a short summary

**What to build:** After each type, the scan prints one short block: items found, first-render count, load steps, whether the walk completed, how many items carry a link when links were asked for, and the elapsed time. The page path joins this block in a later ticket, once a page exists.

**Blocked by:** 06

**Status:** waiting

**Touches:** the scan command only.

**Do not touch:** the envelope builder, the injected helpers, the selection page.

- [ ] One line per type with counts, steps, completeness and elapsed time
- [ ] Link-bearing count appears only when links were asked for
- [ ] The existing per-step progress lines are unchanged
- [ ] A planned unit test covers the summary text built from a result object, with no browser
- [ ] `npm run check` passes
