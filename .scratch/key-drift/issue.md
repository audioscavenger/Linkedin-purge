# Issue: Card identity for purge (report links, key drift, selection flow)

Status: parked (needs its own grilling round before a spec)
Origin: grilling session on 2026-10-26 for `scan --deep` (`.scratch/deep-scan/issue.md`). Out of scope there by decision.

## Problem Statement

Purge has no way to name the card it is acting on. Everything it knows is positional:

- Reaction keys are `reaction:<index>`, the button's position among all reaction buttons on the page.
- Comment keys are the card's `replaceableComment_<id>` element id.
- Report entries carry `postHref`, but the card-metadata extractor returns null for it on most cards (on the user's current likes: usable on a handful of items out of nineteen; null on the rest).

Two consequences, both measured on the user's account on 2026-10-26:

1. **Keys drift between sessions.** A scan file written at 07:49 maps one card to `reaction:0`; a fresh page an hour later maps the same card to `reaction:1`, while another card kept `reaction:3` and a third disappeared from the liked set. A pure insertion or unlike cannot produce that, so the index also shifts when a card's internal DOM changes (cards can carry a nested reaction button, and which ones render varies). The user separately verified by experiment that after unliking a reaction and reloading, the card is gone, which contradicts the code comment that positional keys are "stable across runs".
2. **A stale file can point at the wrong post.** `purge --input` matches keys against whatever the page renders now, and the checkpoint stores positional keys too. Between two runs, an index can denote a different card, so "purge exactly the items I selected" is not currently guaranteed.

The user's goal is a workflow where a scan can be filtered, a subset selected, and that selection purged. That workflow needs a per-card handle that survives a page reload.

## Requirement captured from the user

Every item in the JSON report must carry the direct link to its card (the liked post / the commented post). Today `postHref` is the only link-shaped field and it is usually null, so this needs a better source.

## Candidate link sources (unverified)

- The card's container id looks like `expanded_<encoded>FeedType_PROFILE_REACTIONS` (comments: `expanded<encoded>FeedType_PROFILE_COMMENTS`). The encoded part may decode to an activity URN, which would yield `https://www.linkedin.com/feed/update/<urn>/`.
- `a[href*='/feed/update/']` inside the card, which the extractor already reads and which is null on most cards, possibly because the link only exists in a menu or after expansion.
- Some per-card control's aria-label or data attribute carrying the activity id.

Any of these needs a probe before it can be specced.

## Solution direction (not decided)

A per-card identity that is stable across sessions, recorded by scan and by purge reports, used to re-resolve a selected item on the page (scroll until the identity appears) instead of trusting an index. That, in turn, is what makes "filter the scan, then purge the selection" safe, and what replaces the positional key or supplements it.

## Out of Scope (for the deep-scan issue that spawned this)

- Any fingerprint or identity field in this release.
- Any change to key derivation, checkpoint format, or purge behaviour.
- The selection interface itself.

## Further Notes

- Measured evidence: `data/scan-likes.json` (07:49) versus two live probes (see the deep-scan issue's Further Notes for the full table).
- If identity re-resolution lands, the checkpoint's positional keys become suspect for old checkpoints; that migration question must be answered in that spec.
- The user's stance during the deep-scan grill: do not add new likes while a purge is in progress, so within a run the positional key is acceptable. The parked question is what happens between runs.
