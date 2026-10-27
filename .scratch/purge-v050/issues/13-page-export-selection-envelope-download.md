# 13: Page export: selection envelope download

**What to build:** An Export button downloads `selection-<type>.json`: the same envelope shape, holding only the ticked items with `status: pending`, `count` and `keys` narrowed to them, the source `scannedAt` preserved and `selectedAt` added. The browser saves it; nothing is written to disk by the page itself.

**Blocked by:** 12

**Status:** waiting

**Touches:** the generator template and the browser check harness.

**Do not touch:** the scan command, the purge module, the input loader.

- [ ] Export downloads a file named `selection-<type>.json` with no timestamp
- [ ] The file holds only ticked items, each `status: pending`, with narrowed count and keys
- [ ] `scannedAt` is preserved and `selectedAt` is added
- [ ] Exporting with nothing ticked is refused with a visible message
- [ ] The browser check captures the download and asserts it equals the expected selection envelope
- [ ] `npm run check` passes
