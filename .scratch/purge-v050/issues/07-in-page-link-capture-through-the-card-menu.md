# 07: In-page link capture through the card menu

**What to build:** When links are asked for, each item gets `itemHref` (the comment link for a comment, the post link for a reaction) and `postHref` (the post link when the card itself exposes one) by opening the card's control menu, choosing "Copy link to post" or "Copy link to comment", and capturing the URL from the page's own clipboard call. The menu is polled for, one retry is allowed, and a missing item yields null rather than failing the scan.

**Blocked by:** 04, 06

**Status:** waiting

**Touches:** the injected in-page helpers and the live page check's link assertion.

**Do not touch:** the scan command, the CLI configuration, the purge module, the selection page.

- [ ] With links on, every item the menu supports gets a non-null `itemHref`; unsupported cards get null without failing the scan
- [ ] A comment's `itemHref` is its comment link and a reaction's is its post link; `postHref` is filled only when the card exposes a post link in its DOM
- [ ] The capture hooks the page's own clipboard write rather than reading the clipboard
- [ ] Menu polling and the single retry live beside the existing link constants, not in the CLI
- [ ] The live check captures one link on each tab when asked, within its bounded budget
- [ ] `npm run check` passes
