# 03: Docs, glossary, ADR 0002, changelog

**What to build:** The written record for the restored full scan, in the project's own vocabulary, so users can find the new parameter and future readers can see why it is opt-in. This ticket owns all documentation for the change, which is why it runs after both code tickets and why the code tickets were told not to touch these files.

- README: `--deep` in the parameter list with its default; the new `behavior.deepScan` key in the config block; the changed meaning of `scrollWait` (growth deadline per load step, not a fixed sleep) and its new default; a short "what a scan covers" paragraph stating that plain `scan` reports the first render only (about 20 cards) and `--deep` walks the whole Activity List, that a partial deep scan is written with `complete: false`, and that the envelope records a per-item load step.
- README, two truths the live run exposed: an existing local `config.json` keeps its own `scrollWait` (the file is gitignored and older installs hold 800), so the section must say how to adopt the new deadline (set it to 3000, or delete the key and let the default apply) and what the smaller value costs (more fruitless load steps, shorter end-of-list tolerance). And the current claim that `timeout: null` disables the timeout is false in code: null falls back to the default, so state what actually happens instead of what was intended.
- README, step numbers: they are attempt indices, so a gap means a load step that found nothing new (the live likes file shows steps 0, 2, 4, 7, 8, 11, 13, 15). Say so, otherwise the gaps look like lost data.
- Navigation index: a row for the Activity Loader, the updated in-page export list (traversal primitives in, show-more out), the scan command's purpose corrected to shallow by default and deep with the flag, and the deleted legacy configuration module removed from the module list.
- Glossary: Activity List (the scrollable container of Purge Items the traversal walks), Load Step (one scroll-and-poll cycle), Shallow Scan (first render only), Deep Scan (walks the Activity List to exhaustion). Implementation-free, per the glossary's own rule.
- ADR 0002: why deep is opt-in rather than the default. The trade-off: a default that reports a page as a total is a quietly wrong answer, while a default that walks is slow for the smoke-test use and changes what `scan` meant. It qualifies as an ADR because it is hard to reverse once docs and habits assume 19-item scans, surprising without context, and the product of a real trade-off. Cite the issue and the probe numbers.
- Changelog: the Unreleased entry in the house format covering the restored full scan behind `--deep`, the polling load step, the envelope additions, the purge tab-navigation fix, and the corrected stability comment.

**Blocked by:** 01, 02 (it documents behaviour and defaults those tickets define, and must describe the final numbers, not the intended ones)

**Status:** ready-for-agent

**Touches:** `README.md`, `NAVIGATION.md`, `GLOSSARY.md`, a new ADR file, `CHANGELOG.md`.

**Do not touch:** any source or test file. If the shipped behaviour differs from what this ticket describes, report it rather than editing code.

- [ ] README documents `--deep`, `behavior.deepScan`, the new `scrollWait` meaning and default, and what a scan covers
- [ ] The navigation index lists the Activity Loader, the corrected in-page exports, describes scan accurately, and no longer lists the deleted legacy configuration module
- [ ] The glossary defines Activity List, Load Step, Shallow Scan and Deep Scan without implementation detail
- [ ] ADR 0002 is written in the existing ADR format and cites the issue and the measured numbers
- [ ] The changelog Unreleased entry is added in the house format
- [ ] `npm run health` passes
