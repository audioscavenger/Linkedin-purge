# 20: Purge marks not-found and retries what is not final

**What to build:** When the list is exhausted, every selected item never matched becomes `not-found`. A second run acts again on `pending`, `failed` and `not-found`, and skips `purged` items.

**Blocked by:** 19

**Status:** waiting

**Touches:** the purge runner and the purge test file.

**Do not touch:** the purge command, the status command.

- [ ] An unmatched selection ends as `not-found`, and the run reports it by identity
- [ ] A re-run of the same selection skips `purged`, retries `failed` and `not-found`, and never touches `no-op`
- [ ] The run's closing summary counts each status
- [ ] Fake-page tests cover the exhausted walk and the retry run
- [ ] `npm run check` passes
