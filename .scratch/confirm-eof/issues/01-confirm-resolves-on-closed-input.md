# 01: Confirmation resolves on closed input instead of hanging

**What to build:** A purge run that is driven from a pipe, a script or CI must never hang on a confirmation prompt. If input ends before an answer, the adapter reports "not confirmed" so the run aborts safely with a one-line explanation, and the process exits with its browser and profile released. Two prompts in sequence over the same piped input must both resolve.

The confirmation adapter takes its input and output streams by injection, defaulting to the process streams, so every case below is exercised without a TTY.

**Blocked by:** None (can start immediately)

**Status:** parked

- [ ] EOF before an answer resolves as "not confirmed", the run aborts, and the user is told input ended
- [ ] No promise is left pending when the input stream closes, so the process cannot hang on a prompt
- [ ] Two sequential prompts over one piped stdin both resolve, in order
- [ ] A non-TTY stdin is handled deliberately rather than by luck
- [ ] Unit tests with injected streams cover: YES confirmed, any other answer refused, EOF before an answer, two prompts over one pipe
- [ ] Existing purge runner tests pass unchanged, and the prompt wording a real user sees is untouched
- [ ] `npm run test` and `npm run check` pass
