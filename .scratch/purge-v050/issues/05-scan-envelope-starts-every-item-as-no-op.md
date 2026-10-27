# 05: Scan envelope starts every item as no-op

**What to build:** The envelope builder writes `status: no-op` on every item it writes, so a fresh scan states plainly that nothing has been chosen or acted on, and readers never have to treat a missing status as a meaning.

**Blocked by:** 02

**Status:** waiting

**Touches:** the envelope builder and its test.

**Do not touch:** any other module.

- [ ] Every item in a built envelope carries `status: no-op`
- [ ] An item that already carries a status keeps it (the builder does not overwrite a real status)
- [ ] All pre-existing envelope fields keep their meaning, so `purge --input` still reads old and new files
- [ ] `npm run check` passes
