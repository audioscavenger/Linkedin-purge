# Scan envelope is the only state, retiring checkpoint and report

Since v0.4.0 the tool carried three overlapping stores that could disagree:
a checkpoint of acted keys (`data/checkpoint-<type>.json`), a date-stamped
report per run (`data/report-<type>-<timestamp>.json`), and the scan envelope
(`data/scan-<type>.json`). None of them was what the user looked at, and none
of them answered "what did I choose to delete?". v0.5.0 collapses them to one:
the scan envelope is the only state. Every item carries a Purge Status
(`no-op`, `pending`, `purged`, `failed`, `not-found`), and every action -
whether the user ticks items on the Selection Page or purge --input acts on
them - writes its status straight into the envelope through the store, one
atomic write per item, so an interrupted run keeps every status earned so far.
`npm run status` counts statuses from the envelope; `--reset-checkpoint` and
the checkpoint/report modules are gone; existing `data/checkpoint-*.json` and
`data/report-*.json` files are left untouched and unread.

The trade-off is deliberate: one source of truth cannot disagree with itself,
and the envelope is already the document the user looks at (the Selection Page
renders from it), so it is the natural place for statuses to live. Retiring the
checkpoint means a run can no longer resume across restarts, but v0.5.0's
review-first flow is short-lived by design - scan, review, select, purge,
review - and the envelope re-sets statuses on every new scan, so a stale
checkpoint was more likely to mislead than to help.

It qualifies as an ADR because it is hard to reverse: once the README, the
changelog, `npm run status`, and the habit of "scan, then look at the page"
all assume the envelope is the only state, reintroducing a checkpoint or a
date-stamped report is a breaking change to the documented flow, not an edit.
It is surprising without this context, because `purge --input` looks like it
could keep its own sidecar state, when in fact the statuses it writes live in
the envelope the scan already wrote. And it is the product of a real trade-off:
three stores offered redundancy, but redundancy that can disagree is worse than
none, and the three stores had already diverged in practice (a checkpoint
without a report, a report without a matching checkpoint, an envelope neither
knew about).

Spec: `.scratch/purge-v050/issue.md` (v0.5.0 spec; ticket 02:
`.scratch/purge-v050/issues/02-purge-status-vocabulary.md`, ticket 05:
`.scratch/purge-v050/issues/05-scan-envelope-starts-every-item-as-no-op.md`,
ticket 15: `.scratch/purge-v050/issues/15-envelope-store-with-per-item-marks.md`,
ticket 16: `.scratch/purge-v050/issues/16-status-transition-rules.md`,
ticket 22: `.scratch/purge-v050/issues/22-status-command-reads-the-envelope.md`,
ticket 23: `.scratch/purge-v050/issues/23-remove-reset-checkpoint-loudly.md`,
ticket 24: `.scratch/purge-v050/issues/24-delete-the-checkpoint-and-report-code.md`).
