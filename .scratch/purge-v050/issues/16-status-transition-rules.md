# 16: Status transition rules

**What to build:** One module states which transitions are legal and what a purge should do with each status. `purged` is final; `pending`, `failed` and `not-found` are retried; `no-op` is never acted on.

**Blocked by:** 02

**Status:** waiting

**Touches:** the status module (extending it) and its test.

**Do not touch:** the envelope store, the purge runner.

- [ ] One function answers whether a status may be acted on, and only `purged` and `no-op` are excluded, for different reasons
- [ ] Attempt outcomes map to exactly one of `purged`, `failed`, `not-found`
- [ ] Tests pin every status against the transition rules
- [ ] `npm run check` passes
