# 23: Remove --reset-checkpoint, loudly

**What to build:** The retired flag is refused with one clear line saying it was removed in 0.5.0 and that statuses now live in the scan envelope, rather than being silently ignored. The command stops passing anything checkpoint-shaped.

**Blocked by:** 21

**Status:** waiting

**Touches:** the purge command only.

**Do not touch:** the checkpoint module itself (the next ticket deletes it), the runner.

- [ ] Passing `--reset-checkpoint` prints the removal message and exits non-zero without starting a browser
- [ ] The flag no longer appears in the help screen
- [ ] Nothing checkpoint-shaped is constructed or passed
- [ ] `npm run check` passes
