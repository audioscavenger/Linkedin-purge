# 26: README and navigation for the new flow

**What to build:** The README describes the flow the tool now has - deep scan, the generated page, filters and selection, export, purge of a selection, statuses on the page - and the navigation index lists the new modules and stops listing the retired ones.

**Blocked by:** 24

**Status:** waiting

**Touches:** README and the navigation index.

**Do not touch:** any source or test file, GLOSSARY, CHANGELOG, ADRs.

- [ ] README documents the scan, review, select, purge, review flow and where the page lives
- [ ] README states the cost of `--links`, that a new scan resets statuses, and that old checkpoint and report files are ignored
- [ ] The navigation index lists the new modules and no longer lists the retired ones
- [ ] `npm run health` passes
