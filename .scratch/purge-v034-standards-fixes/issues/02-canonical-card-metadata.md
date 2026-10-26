# 02: One canonical card-metadata extraction

**What to build:** Scanning and purging the same item always record the same author, postHref, and dateTime. Deleting a comment records the same metadata as deleting a reaction, so report entries are uniformly useful across both types. The `author` field means the post author (the glossary term), never the purged account.

**Blocked by:** None (can start immediately)

**Status:** done

- [ ] Exactly one card-metadata extraction routine remains in the in-page helpers (the scan path's: post-author control-menu label first, skipping the reactor's own profile link, ordered fallbacks, then date text and the time element)
- [ ] Both delete flows (reaction and comment) invoke the single extractor on the card *before* the destructive click
- [ ] The reaction flow's divergent divergence block (first profile/company link, time-element-then-aria-label date walk) is deleted, not deprecated
- [ ] Comment-deletion results carry the same shape as reaction-deletion results: key, state, author, postHref, dateTime
