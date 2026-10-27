# Issue: Confirmation prompts hang when stdin is not a terminal

Status: parked (needs its own grilling round before tickets are worked)
Origin: found while verifying the purge tab fix on 2026-10-27 (.scratch/deep-scan/issues/02-purge-type-tab.md). Parked by the user rather than fixed in that branch.

## Problem Statement

`ConfirmAdapter` asks its question through `readline` on `process.stdin` and returns a promise that only settles inside the answer callback. Nothing handles stdin closing. When the command is driven from a pipe, a script or CI, two things go wrong:

1. Input that arrives before the second prompt is consumed by the first `readline` interface, so the later question never sees its answer.
2. Once stdin reaches EOF, `question()` never calls back, so the promise never settles and the process hangs with the browser and the profile still open.

Observed, not inferred. Verifying the per-type purge loop with `printf "no\nno\n" | node src/cli.js purge --type all --headless ...` printed both prompts ("Delete 20 comments items?", then "Delete 18 likes items?") and then hung until the 5 minute timeout killed it. The hang is not a loss of data, but it leaves a browser holding the profile and looks exactly like a stalled purge.

Today the tool is only interactive, so this harms scripted and agent-driven runs, plus any future CI check that wants to exercise a purge path without a human.

## Solution (direction, not decided)

Make closed input a deterministic answer rather than a wait: if stdin ends, or the stream is not a TTY, resolve the confirmation as "not confirmed" so the run aborts safely and says why in one line. Treat the destructive default as refusal, never as consent.

The second half is testability: the adapter should take its input and output streams by injection (defaulting to the process streams) so the acceptance cases can be exercised without a TTY at all.

## Requirements captured

- EOF before an answer aborts the run with a clear message, and never leaves a pending promise.
- Two prompts in sequence over one piped stdin both resolve.
- A non-TTY stdin is handled deliberately, not by accident.
- The adapter is unit-testable with injected streams: yes, no, EOF before answer, and the two-prompt sequence.
- Existing purge runner behaviour, prompt wording for real users, and the confirmation threshold are unchanged.

## Out of Scope

- A `--yes` / non-interactive purge flag that skips confirmation. That is a product decision of its own, and it would weaken the destructive-action guard the tool sells.
- Changing what counts as confirmation (today: the word YES, case-insensitive).
- Any change to the purge loop, checkpoints or reports.

## Further Notes

- Evidence command and output live in the ticket note at the bottom of `.scratch/deep-scan/issues/02-purge-type-tab.md`.
- A related, separate wart spotted in the same run: a `complete: false` scan file is accepted by `purge --input` without a word, which dents ADR 0001's loud-contract principle. Not part of this issue; recorded in the code review of the deep-scan branch.
