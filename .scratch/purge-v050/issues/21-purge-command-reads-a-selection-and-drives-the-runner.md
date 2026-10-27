# 21: Purge command reads a selection and drives the runner

**What to build:** The purge command loads the selection envelope through the existing input loader, hands the runner the envelope store, and reports the outcome. It no longer constructs or passes a checkpoint or a report writer.

**Blocked by:** 19

**Status:** waiting

**Touches:** the purge command only.

**Do not touch:** the checkpoint and report modules (a later ticket deletes them), the runner, the status command.

- [ ] `purge --input <selection>` acts on the selection and prints counts by status at the end
- [ ] A selection with nothing actionable exits without prompting
- [ ] The command no longer wires a checkpoint or a report writer
- [ ] `npm run check` passes
