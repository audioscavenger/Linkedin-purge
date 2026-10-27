# 14: Scan generates the page, prints its path and opens it

**What to build:** After each type the scan writes `data/selection-<type>.html` from that scan's envelope, adds the relative path to its summary, and opens the page in the OS default browser. Opening is best effort: a failure prints the path and never fails the scan.

**Blocked by:** 08, 09

**Status:** waiting

**Touches:** a new default-browser opener module with its test, and the scan command.

**Do not touch:** the generator module, the purge module, the injected helpers.

- [ ] A scan leaves exactly one page per type at the fixed path, containing that scan's data
- [ ] The summary prints the page's relative path
- [ ] The page opens through the OS default browser, never the automation browser
- [ ] An opener failure is reported in one line and the scan still exits successfully
- [ ] The opener is injectable so its success and failure paths are unit-tested without opening anything
- [ ] `npm run check` passes
