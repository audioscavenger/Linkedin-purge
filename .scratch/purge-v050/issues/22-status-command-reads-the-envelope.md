# 22: Status command reads the envelope

**What to build:** `npm run status` reports per-type counts by status from the scan envelope, and says clearly when a type has no envelope yet, instead of reading a checkpoint file.

**Blocked by:** 15

**Status:** waiting

**Touches:** the status command and a new test for it.

**Do not touch:** the purge command, the envelope store, the scan command.

- [ ] Per type it prints counts for purged, failed, not found, pending and no-op
- [ ] A missing envelope is reported as "no scan yet" rather than an error
- [ ] No checkpoint file is read
- [ ] A temp-directory test covers both the counts and the missing-envelope line
- [ ] `npm run check` passes
