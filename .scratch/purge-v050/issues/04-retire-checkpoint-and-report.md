# 04: Retire the checkpoint and the report; status reads the envelope

**What to build:** One state, not three. The envelope's per-item status is the only record of what happened, and `npm run status` reports from it.

- The checkpoint store and its adapter, the date-stamped report writer and its adapter, and the `--reset-checkpoint` flag all go.
- The purge command stops constructing them; its entry point exports only what still exists.
- `--reset-checkpoint` is refused explicitly, with a message saying it was removed in 0.5.0 and that statuses now live in the scan envelope, rather than being silently ignored.
- `npm run status` reads each type's envelope and prints counts by status (purged, failed, not found, pending, no-op), and says plainly when a type has no envelope yet.
- Existing `data/checkpoint-*.json` and `data/report-*.json` files are left on disk and ignored.

**Blocked by:** 03 (the store and statuses must be the live path before the old path is removed)

**Status:** ready-for-agent

**Touches:** the checkpoint module and adapter, the report adapter, the purge module entry point, the purge command, the status command, the purge test file, and the package test lists.

**Do not touch:** the scan command, the selection page, the injected in-page helpers, the CLI configuration or help screen (other than removing the flag's mention), `README.md`, `NAVIGATION.md`, `GLOSSARY.md`, `docs/adr/`, or `CHANGELOG.md`. Do not write a changelog entry.

- [ ] No code path writes a checkpoint file or a date-stamped report file
- [ ] `--reset-checkpoint` fails loudly with a message that names 0.5.0 and the envelope, instead of being ignored
- [ ] `npm run status` prints per-type counts by status from the envelope, and a clear line when a type has no envelope
- [ ] Old checkpoint and report files on disk are ignored and left untouched
- [ ] The retired modules, adapters and exports are deleted, not kept as dead code
- [ ] The purge runner tests still pass with the checkpoint and reporter fakes removed
- [ ] `npm run test` and `npm run check` pass
