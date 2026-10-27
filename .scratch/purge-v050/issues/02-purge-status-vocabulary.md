# 02: Purge Status vocabulary

**What to build:** One module defines the five statuses as named constants (`no-op`, `pending`, `purged`, `failed`, `not-found`) and answers whether a status is final. Everything that writes or reads a status uses it, so a typo cannot invent a sixth value.

**Blocked by:** 01

**Status:** waiting

**Touches:** a new status module and its test.

**Do not touch:** anything else.

- [ ] The module exports the five statuses and a finality check where only `purged` is final
- [ ] A test asserts the exact five values and that finality holds for exactly one of them
- [ ] No other module defines a status string literal yet
- [ ] `npm run check` passes
