# 03: Walking purge by Card Identity, with statuses written as it goes

**What to build:** A purge acts on the items the user selected, finds them by identity rather than position, and records the result of each one in the scan envelope.

- Purge reads the selection envelope, walks the Activity List through the existing load-step operation, and matches cards by Card Identity.
- It acts only on selected items whose status is not `purged` (so a second run retries `pending`, `failed` and `not-found`, and never touches `purged`).
- Acting is one card in, one result out: the runner picks the exact card and asks for that card to be toggled or deleted. The list-shaped first-eligible search is deleted.
- The walk stops as soon as every selected item is final. When the list is exhausted, any selection never matched becomes `not-found`; a refusal from LinkedIn becomes `failed`.
- A new envelope store owns the file and the durability guarantee: marking one item's status writes the file atomically on the spot, with no separate save the runner could forget. An interrupt keeps the statuses already earned.
- The checkpoint and the date-stamped report are no longer used by the runner in this ticket; they are deleted in ticket 04.

**Blocked by:** 01 (Card Identity on every item)

**Status:** ready-for-agent

**Touches:** a new envelope store module, the purge runner, the purge page adapter and adapter interfaces, the injected in-page helpers (one-card delete by identity), the status module (transition rules), the purge test file, and the package test lists.

**Do not touch:** the scan command, the selection page, the CLI configuration or help screen, the status command, `README.md`, `NAVIGATION.md`, `GLOSSARY.md`, `docs/adr/`, or `CHANGELOG.md`. Do not write a changelog entry.

- [ ] A selection of two items on a small history purges exactly those two and stops without walking further
- [ ] A selection whose item is absent ends with that item marked `not-found`, and nothing else deleted
- [ ] A refusal from LinkedIn marks the item `failed`; a re-run retries it and skips items already `purged`
- [ ] Items not in the selection keep `status: no-op`
- [ ] The envelope file is updated on disk after each acted item, and a kill mid-run loses at most the item in flight
- [ ] The runner holds no writable state of its own; all status writing goes through the store
- [ ] The list-shaped first-eligible operation is gone from the adapter and the injected helpers
- [ ] Fake-page tests cover matching, the early stop, `not-found`, `failed`, retry-skip and the no-op default; store tests cover load, mark, atomic save and reload after an interrupt
- [ ] `npm run test` and `npm run check` pass
