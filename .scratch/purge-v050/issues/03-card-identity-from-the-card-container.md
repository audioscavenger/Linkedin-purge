# 03: Card Identity from the card container

**What to build:** Each item card's stable identity is read from the card's own container element id and stored on the item as `cardId`. It is opaque to the tool and identical across two page loads of the same account. The live page check asserts it on both tabs so a LinkedIn markup change fails there instead of silently producing items with no identity.

**Blocked by:** 01

**Status:** waiting

**Touches:** the injected in-page helpers, the live page check module and script, and its test.

**Do not touch:** the scan command, the purge module, the selection page.

- [ ] Every item card yields a non-empty `cardId`; cards without a matching container yield null and are skipped as today
- [ ] Two loads of the same tab produce the same `cardId` for the same card
- [ ] The live page check asserts a non-null `cardId` for both tabs and names the helper when it fails
- [ ] The in-page helpers remain a single self-contained file with no imports
- [ ] `npm run check` passes and the live check passes on a real profile
