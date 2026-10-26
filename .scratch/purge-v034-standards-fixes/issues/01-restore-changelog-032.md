# 01: Restore the 0.3.2 changelog entry

**What to build:** The changelog's release history is complete again: the 0.3.2 entry is present exactly as the v0.3.2 tag shipped it, sitting directly above a 0.3.3 entry that describes only 0.3.3's own work. A reader of the changelog sees every release and no release claims another release's changes.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The 0.3.2 entry exists in the changelog, verbatim as it stood at the v0.3.2 tag (recovered from the tag's changelog via git)
- [ ] The 0.3.3 entry contains only its two genuine bullets: enriched scan output, and the `--input` feature
- [ ] No bullet is duplicated between the 0.3.2 and 0.3.3 entries
- [ ] The 0.3.3 tag is not re-tagged and remains untouched
