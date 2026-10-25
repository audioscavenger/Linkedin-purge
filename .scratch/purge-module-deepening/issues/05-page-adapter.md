# 05: PageAdapter implementation

**What to build:** The page adapter wraps Playwright page evaluation calls needed by the purge loop: collecting item keys, deleting the first eligible item, clicking show more, and waiting. It delegates to the real page but is abstracted so tests can inject a fake page.

**Blocked by:** 01 (Purge Runner module skeleton).

**Status:** ready-for-agent

- [ ] Collect keys from the current page (comments or reactions)
- [ ] Delete the first eligible item given a skip set of keys
- [ ] Click "show more" if present on the page
- [ ] Wait for a given number of milliseconds
- [ ] Can be replaced by an in-memory fake page in tests
