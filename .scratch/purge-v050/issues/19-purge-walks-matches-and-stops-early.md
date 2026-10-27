# 19: Purge walks, matches and stops early

**What to build:** Purge reads a selection, walks the Activity List through the load-step operation, matches cards by Card Identity, acts on selected items that are not already `purged`, and stops the moment every selected item is final. Each result is written through the store: `purged` on success, `failed` on refusal.

**Blocked by:** 15, 16, 18

**Status:** waiting

**Touches:** the purge runner and the purge test file.

**Do not touch:** the purge command, the status command, the injected helpers.

- [ ] A selection of two items on a longer history acts on those two and stops without walking further
- [ ] Items not in the selection keep `no-op`
- [ ] Success writes `purged`, refusal writes `failed`, both through the store
- [ ] The runner holds no writable state of its own
- [ ] Fake-page tests cover matching, the early stop, the two outcomes and the runner's indifference to page order
- [ ] `npm run check` passes
