# itemHref is mandatory; targeted and automated purge without a prior scan

## Status

Accepted. This ADR records a deliberate design change to the scan and purge flows.

## Context

Until now, `itemHref` (the direct link to a single comment or reaction card) was an optional link captured only when `behavior.links` was on, by opening each card's control menu and hooking the clipboard - about one second per item. Scan collected item metadata card by card; purge then crawled the Activity List again, matching cards by Card Identity, and could only act on items it re-met on the page. `--limit` could apply to either flow, and `--deep` only made sense on a scan.

The last scan surfaced that `itemHref` is retrievable at effectively zero incremental cost during the scan itself (the card is already being read), and that the `itemHref` it produced for likes works for every stored item: it leads straight to the item liked, ready to be unliked. Two consequences follow:

1. **itemHref is now mandatory.** Every Purge Item in the scan envelope carries a working `itemHref`; there is no longer an optional link step. The scan does not need a separate `--links` pass to produce purgeable links.
2. **Purge no longer has to crawl the page to purge.** Since a Purge Item carries its own direct link, purge can target individual items without walking the Activity List. `--limit` and `--deep` are therefore purge-side automation knobs, not scan-side review knobs:
   - `--limit` with no `--input`: purge crawls the first page and purges up to `limit` items, no scan needed.
   - `--limit` with `--input`: `--input` wins; `limit` caps the number of marked-todo items actually purged; `--deep` is dropped.
   - `--input` alone: purge acts on exactly the items marked `todo` in the selection envelope.
   - `--deep` only applies to a scan, or to a purge without `--input` (crawl-to-purge).
3. **`--type all` scoping:** `--limit` applies per Activity type, not as a sum across both types. `--limit 25 --type all` purges up to 25 comments and up to 25 reactions.

The comments scan is broken under the old design: `itemHref` is always null for comments because the comment link capture queries the post's control menu ("Open control menu"), which offers "copy link to post", not "copy link to comment". Comments must use their own comment menu button ("View more options for ... comment", which offers "copy link to comment").

## Decision

- `itemHref` is a required field on every Purge Item produced by a scan. A scan without `itemHref` is incomplete.
- Purge gains two mutually scoped automation modes: **selection purge** (`--input`, acts on `todo` items) and **automated purge** (no `--input`, crawls and purges up to `--limit`, optionally `--deep`). They are not combined: `--input` always wins.
- `--limit` applies per Activity type.
- `--deep` is meaningful only for a scan or a crawl-to-purge without `--input`.
- The comment link capture is fixed to open each comment's own menu button so `itemHref` is populated for comments too.

## Consequences

- The `--links` flag and the per-item menu capture for link collection lose their purpose: itemHref is now part of every scan, not an opt-in extra. The existing `behavior.links` config and link-column rendering on the Selection Page remain for the page's display, but itemHref itself is no longer gated behind them.
- Purge without `--input` becomes a supported destructive path: crawl first page, act on up to `--limit` items, confirm once. The dry-run confirmation still guards it.
- A Purge Item that was scanned and present cannot come back as `not-found` during purge unless the user acted on it between scan and purge. `not-found` is therefore an edge-case bug signal, not a retryable status: no retry on `not-found`.
- The Selection Page still renders from the envelope and shows `itemHref` where present; the link column rule (only when at least one item has a link) is now always true after a scan.

## Related

- Spec issue #10 (purge honours every option it documents) - rewritten for the `--limit` / `--input` / `--deep` semantics above.
- Spec issue #7 (one purge walk, two eligibility policies) - `not-found` is no longer retried; the selection exhaustion rule changes accordingly.
- Spec issues #8, #9, #11 - reviewed for consistency; no interface change required.

## Further notes

Hard to reverse: once scan output always carries `itemHref` and purge can run without a scan, documented flows and scripts that assume "scan first, then purge" change. The README parameter list and the help screen must state `--limit` as an automation-only knob (no `--input`), per-type scoped.
