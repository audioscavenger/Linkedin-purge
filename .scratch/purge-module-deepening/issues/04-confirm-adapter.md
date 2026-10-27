# 04: ConfirmAdapter implementation

**What to build:** The confirm adapter prompts the user for confirmation before a purge run starts and returns a boolean. Default implementation uses the terminal prompt ("Type YES to proceed:"). It is abstracted so tests can auto-confirm without a TTY.

**Blocked by:** 01 (Purge Runner module skeleton).

**Status:** done (shipped in v0.3.0)

- [ ] Default implementation asks the user via readline prompt
- [ ] Returns true only when user answers YES
- [ ] Interface can be satisfied by a mock for testing without a TTY
