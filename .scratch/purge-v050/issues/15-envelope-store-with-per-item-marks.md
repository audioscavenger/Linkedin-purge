# 15: Envelope store with per-item marks

**What to build:** One module owns the scan envelope file: load it, mark one item's status by Card Identity, and answer counts. Marking writes the file atomically on the spot, so an interrupt keeps every status earned so far and the caller cannot forget to save.

**Blocked by:** 02

**Status:** waiting

**Touches:** a new envelope store module and its test.

**Do not touch:** the purge runner, the status command, the scan command.

- [ ] `mark` updates one item and leaves the file on disk already updated, with no separate save call
- [ ] The write is atomic: a reader never sees a truncated file
- [ ] Marking an unknown identity fails with a named error rather than creating an item
- [ ] Counts by status are available for the status command to reuse
- [ ] Tests cover load, mark, reload after an interrupt, unknown identity and atomicity
- [ ] `npm run check` passes
