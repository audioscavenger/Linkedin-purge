# Issue: A deep walk on a large history is slow, can stall, and loses everything if killed

Status: parked (needs its own investigation before tickets are worked; ticket 01 is ready on its own)
Origin: re-verification of scan --deep after the review fixes and the `growthWait` rename, 2026-10-27 (.scratch/deep-scan/issues/01-deep-scan-end-to-end.md).

## Problem Statement

A deep walk works and is honest up to a few hundred cards, then three things show up at once.

1. **Every batch costs two load steps.** On the live likes tab, cards arrive just after a step's growth deadline: one step scrolls, sees nothing for the full `growthWait`, and the next step's scroll is what makes the batch appear. Step numbers with items are therefore 0, 2, 4, 6, ... for long stretches. That is roughly one wasted 3 second wait per batch, and with about 40 batches a 410-card walk takes about four minutes where it could take two.

2. **A comments walk stalled.** A comments walk reached 317 items by step 63, then produced no output for about twelve minutes until the command was killed at a 15 minute timeout. No error, no timeout of its own (the configured timeout was one hour), no file written. The cause is unknown: it could be a Playwright evaluate that never returned because the page's main thread was saturated by a 300-plus-card feed, or LinkedIn throttling, or something in our per-step read. Nothing in the output distinguishes those.

3. **Nothing is written until the end.** Because the scan writes its file only after the walk finishes, a kill loses the whole walk, including the 317 items already known. The configured `timeout` marks a file incomplete and writes it, but a stall or a hard kill writes nothing at all.

There is also a correctness scar worth remembering: with the previous 800 ms deadline the same likes walk stopped at 86 items and reported `complete: true`. The 3000 ms default found 410. A growth deadline that is too short does not fail loudly; it manufactures a confident wrong answer.

## Solution (direction, not decided)

- **Know where the time goes.** Instrument one step: how long the scroll evaluate takes, how long each growth poll takes, how long the per-step item read takes, and how long the page's own timers are delayed. A stall with no output is indistinguishable from a slow network today.
- **Make the walk debuggable when it hangs.** A hard upper bound per evaluate (Playwright's own timeout), and a loud failure that names the step and the operation instead of hanging forever.
- **Write as you go.** Persist the envelope after each productive step (atomically, so a kill never leaves a truncated file), and mark it incomplete until the walk ends. Then a kill costs one batch, not the run.
- **Consider the two-step cadence.** Either wait for growth with a longer deadline but reset it once growth is seen, or scroll again as soon as the previous step was fruitless, so a batch costs one step rather than two. Measure before choosing: the cost of a longer deadline is a longer silence before the end of the list is declared.

## Requirements captured

- A stalled or killed walk must leave a usable partial file marked incomplete.
- A hung page operation must fail with the step number and the operation name, not hang the process.
- A walk's wall clock should follow the history size predictably, and the README should state the real figure for a few hundred cards.
- The end-of-list declaration must stay conservative: a false `complete: true` is worse than a slow walk.

## Out of Scope

- Changing what a deep scan collects or the envelope's fields.
- Checkpoint/resume for scans (a scan is read-only; the parked purge work owns resume).
- Any change to purge walking, which is parked in `.scratch/key-drift/issue.md`.

## Further Notes

- Evidence: `E:/TEMP/eric/opencode/deep-scan-verify2/scan-likes.json` (410 items, 111 steps, complete) and the killed comments run (317 items at step 63, no file).
- Reproduce the stall before theorising: a comments tab with 300-plus cards, then one `window.LP.readGrowthSignal()` timed from Node.
- If the stall turns out to be LinkedIn throttling, the right answer may be pacing between load steps, which the spec deliberately left out of the first cut.
- Ticket 01 is the answer to the untested in-page half that the deep-scan code review flagged: a live structural check rather than a hand-rolled DOM stub, so a LinkedIn markup change fails loudly with the helper's name. It is the instrumentation this issue needs anyway, which is why it lives here and is ready now while the rest stays parked.
