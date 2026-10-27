# 17: In-page one-card delete by Card Identity

**What to build:** The injected helpers can act on exactly one card, named by its Card Identity, and return one result: success, or a named reason such as refused. The list-shaped first-eligible search is deleted; nothing in the page hunts for a positional key any more.

**Blocked by:** 07

**Status:** waiting

**Touches:** the injected in-page helpers only.

**Do not touch:** the page adapter, the purge runner, the scan command.

- [ ] A call naming a Card Identity toggles or deletes exactly that card and returns one result with the identity
- [ ] A refusal (state did not change, comment still present) returns a failure reason instead of retrying inside the page
- [ ] The old list-shaped first-eligible operation and its positional matching are gone
- [ ] The helpers remain a single self-contained file with no imports
- [ ] `npm run check` passes and the existing live page check still passes
