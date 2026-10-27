# 06: --links plumbing: flag, config, help, page seam

**What to build:** `--links` exists as a flag (also `behavior.links` in config, CLI wins, default off) and reaches the page seam as an option, so the page layer is asked for links. No menu is opened yet: this ticket is the pathway, and the help screen states the measured cost of about one second per item.

**Blocked by:** 01

**Status:** waiting

**Touches:** the CLI configuration module, the CLI help screen, the scan command, and the activity page adapter seam.

**Do not touch:** the injected in-page helpers (the next ticket owns the capture), the purge module, the selection page.

- [ ] `--links` resolves CLI > config > false and is passed to the page seam
- [ ] The help screen lists it with the per-item cost in plain words
- [ ] Without the flag nothing changes in behaviour
- [ ] A unit test pins flag resolution for all three sources
- [ ] `npm run check` passes
