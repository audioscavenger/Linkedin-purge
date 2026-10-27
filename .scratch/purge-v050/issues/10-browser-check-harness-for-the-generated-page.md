# 10: Browser check harness for the generated page

**What to build:** A repeatable check opens a generated page in the Playwright Chromium, proves the table renders from the embedded data, and exits non-zero with a named failure otherwise. It is the harness later page tickets extend, and it stays out of `npm run check` because it needs a browser.

**Blocked by:** 09

**Status:** waiting

**Touches:** a new browser check script for the selection page.

**Do not touch:** the generator module, the scan command, the purge module.

- [ ] The check generates a page from a fixture envelope, opens it, and asserts the expected row count and a sample cell
- [ ] Failures name the assertion, the expectation and what the page actually showed
- [ ] The command is documented in its own help output as needing no login
- [ ] It is not part of `npm run check` or `npm run health`
- [ ] `npm run check` passes
