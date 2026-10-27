# 02: Purge visits its type's tab

**What to build:** Purge reaches the activity tab for the type it is purging, so a run against a full history finds its items instead of reporting "Purge cancelled or nothing to delete". Today it navigates to the activity "all" tab, where neither page detector matches, the key collection comes back empty, and the run ends without touching anything. Alongside that, the purge-side plumbing for the removed in-page show-more helper is deleted.

Purge still does not walk and does not deep-load: it acts on what is on the page, as before. Walking or purging a selected subset is parked in `.scratch/key-drift/issue.md`.

This ticket shares no file with ticket 01 and can run in parallel with it.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Touches:** the purge command, the purge page adapter, the adapter interface file, and the purge test fake.

**Do not touch:** the injected in-page helpers (ticket 01 owns that file, including the helper your wrapper calls; whether it is already deleted when you start is not your concern), and never `README.md`, `NAVIGATION.md`, `GLOSSARY.md`, `docs/adr/`, or `CHANGELOG.md` (ticket 03 owns all documentation; do not add a changelog entry here).

- [x] `purge --type likes` visits the reactions tab, `purge --type comments` visits the comments tab, and `all` loops over both
- [x] A run against a history larger than one page reports a real pending count instead of ending with "cancelled or nothing to delete"
- [x] The show-more wrapper is gone from the page adapter, the adapter interface and the purge test fake, and nothing in the purge path references the deleted in-page helper
- [x] No other behavioural change: the purge runner tests keep passing once the dead stub is removed, proving the loop, eligibility and report behaviour did not move
- [x] `npm run test` and `npm run check` pass
