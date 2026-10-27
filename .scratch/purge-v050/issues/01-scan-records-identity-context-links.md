# 01: Scan records Card Identity, context, optional links and an initial status

**What to build:** A deep scan stores enough about each item for a person to recognise it and for a later purge to match it without trusting positions.

- Every item gets a **Card Identity**: the stable token taken from the card's own container in the page. It is opaque to the rest of the tool and is never displayed.
- Every item gets `status: no-op`, so the envelope carries the five-value vocabulary from the day it is written (the vocabulary constants live in one small module).
- Comments get `text`: the body of the comment, capped at 280 characters. Every item gets `postExcerpt`: the first 140 characters of the post body, null when the card has none.
- `--links` (and `behavior.links`, CLI wins, default off) additionally fills `itemHref` (the comment link for a comment, the post link for a reaction) and `postHref` (the post link when the card itself exposes one) by opening the card's control menu, choosing "Copy link to post" or "Copy link to comment", and capturing the URL from the page's own clipboard call. It costs about 0.8 s per item; the help screen says so. Without the flag both fields are null and no menu is opened.
- The envelope's existing fields, and `purge --input`'s contract, do not change.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Touches:** the injected in-page helpers, the scan command, the CLI configuration and help screen, a new status-vocabulary module, the live page check and its unit tests, and the package test lists only if a new test file appears.

**Do not touch:** the purge module, the selection page (does not exist yet), `README.md`, `NAVIGATION.md`, `GLOSSARY.md`, `docs/adr/`, or `CHANGELOG.md`. Those belong to other tickets. Do not write a changelog entry.

- [ ] Both tabs produce a non-null Card Identity for every item card, and it is identical across two scans of the same account within one session
- [ ] A scan without `--links` opens no menus and stores null in both link fields
- [ ] `--links` fills `itemHref` for every item it can and leaves null where the menu has no such item, without failing the scan
- [ ] Comment items carry `text` (capped, null when the card has no body) and all items carry `postExcerpt` (capped, null when absent)
- [ ] Every item carries `status: no-op`, and the five statuses are defined in one module rather than as scattered literals
- [ ] `--links` appears in the help screen with its per-item cost, and is also settable in config
- [ ] The live page check asserts Card Identity on both tabs, and one link capture when asked to, with a bounded budget
- [ ] `npm run test` and `npm run check` pass; the live check passes on a real profile
