# 18: Page adapter: one-card operation

**What to build:** The purge page adapter exposes the one-card operation and nothing list-shaped, so the runner asks for a card by identity and receives one result. The adapter interface file matches the shipped adapter.

**Blocked by:** 17

**Status:** waiting

**Touches:** the purge page adapter and the adapter interface file.

**Do not touch:** the purge runner (next ticket owns it), the injected helpers.

- [ ] The adapter exposes collect, one-card act, load step and wait, with no first-eligible or eligible-key list
- [ ] The interface file matches the shipped adapter exactly
- [ ] The purge test fake is updated to the same surface
- [ ] `npm run check` passes
