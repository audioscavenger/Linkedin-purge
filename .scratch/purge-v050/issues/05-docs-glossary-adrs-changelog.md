# 05: Docs, glossary, ADRs and changelog for v0.5.0

**What to build:** The written record of the release, so the tool's documents describe the flow the user actually has: scan, look at one page, select, purge, look again.

- README: the new flow end to end (deep scan, the generated page and where it lives, filters and select-all, export, purge of a selection, statuses on the page); `--links` with its per-item cost; `npm run status` reading the envelope; the fact that a new scan resets statuses because the last scan is the truth; that checkpoints and date-stamped reports are gone and old files are ignored.
- Navigation index: the new modules (page generator, default-browser opener, envelope store, status vocabulary) and the deleted ones (checkpoint store and adapter, report adapter); the scan and purge command descriptions updated to the new flow; the in-page export list if it changed.
- Glossary: keep Selection and Purge Status, retire Checkpoint and Report Entry, and make sure Key says plainly that it is session-scoped while Card Identity is not.
- ADR 0003: the client-side Selection Page (static file, embedded data, browser download, no server, no picker).
- ADR 0004: the scan envelope as the only state (retiring the checkpoint and the dated report).
- Changelog: an Unreleased entry covering scan context and identity, `--links`, the Selection Page, walking purge with statuses, and the retirement of checkpoints and reports.

**Blocked by:** 01, 02, 03, 04

**Status:** ready-for-agent

**Touches:** `README.md`, `NAVIGATION.md`, `GLOSSARY.md`, `docs/adr/`, `CHANGELOG.md`.

**Do not touch:** any source or test file. If the shipped behaviour differs from what this ticket describes, report it rather than editing code.

- [ ] README describes the scan, review, select, purge, review flow, including where the page lives and how a selection reaches purge
- [ ] README states the cost of `--links`, what a new scan does to statuses, and that old checkpoint and report files are ignored
- [ ] The navigation index lists the new modules and no longer lists the retired ones
- [ ] The glossary keeps Selection and Purge Status, retires Checkpoint and Report Entry, and states the Key versus Card Identity distinction
- [ ] ADR 0003 and ADR 0004 are written in the existing ADR format and cite the spec
- [ ] The changelog Unreleased entry covers the release in the house format
- [ ] `npm run health` passes
