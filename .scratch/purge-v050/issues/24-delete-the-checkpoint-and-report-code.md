# 24: Delete the checkpoint and report code

**What to build:** The checkpoint store, its adapter, the report writer adapter and their exports are deleted, along with the purge test fakes that existed only for them. No code path writes a checkpoint file or a date-stamped report, and old files on disk are ignored.

**Blocked by:** 23

**Status:** waiting

**Touches:** the checkpoint module, the checkpoint adapter, the report adapter, the purge module entry point, and the purge test file.

**Do not touch:** the scan command, the selection page, the status command.

- [ ] The retired modules, adapters and exports are gone, with no dangling imports
- [ ] No checkpoint or report file is written by any command
- [ ] Existing `data/checkpoint-*.json` and `data/report-*.json` files are left untouched and unread
- [ ] The purge tests pass without the removed fakes
- [ ] `npm run check` passes
