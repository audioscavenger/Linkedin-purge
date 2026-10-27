# Issue: v0.5.0 - Selection Page, and the scan envelope as the only state

Status: ready-for-agent
Origin: grilling session on 2026-10-27 (Q1-Q19), four read-only live probes, and the parked `.scratch/key-drift/issue.md`, which this spec supersedes.

## Problem Statement

Since v0.4.0 the tool can walk a whole activity history, but the only ways to purge are the first page or `purge --input` with keys that drift. A purged selection has no trustworthy identity: reaction keys are positions that move between sessions, and the user's own experiment showed an unliked card disappearing on reload. Choosing what to delete therefore means either trusting drift or purging everything.

The user cannot see what was scanned either. The output is a JSON envelope and a text log; deciding "do I really want to unlike this" means opening LinkedIn separately, item by item.

Three overlapping state stores make the workflow hard to reason about: a checkpoint of acted keys, a date-stamped report per run, and the scan envelope. They can disagree, and none of them is what the user looks at. The user's model is simpler: one scan, one page, one truth, refreshed after every action.

Finally, the envelope cannot answer "what did I say, and to whom". It has no comment text, no post excerpt, and usually no link, so a report entry is a key and a date rather than something a person can check.

## Solution

- `scan --deep` (with `--links` when wanted) writes the scan envelope, which now carries, per item: a stable **Card Identity**, the comment text or null, a post excerpt, a **Purge Status**, and - only with `--links` - the item and post links. It then generates `data/selection-<type>.html` with the data embedded, prints a short summary with that relative path, and opens it in the user's default browser.
- The **Selection Page** is a plain table over that data: filters for reaction state, author and date, a checkbox per row, a master checkbox that applies to the currently filtered rows, a status column, a partly-populated link column (hidden entirely when no item has a link), and an Export button that downloads the selected items as a selection envelope.
- `purge --input <selection>` walks the Activity List, matches cards by Card Identity, acts on every selected item that is not already purged, and stops as soon as every selected item is final. It writes each item's status into the scan envelope as it goes, then regenerates the page and opens it.
- The checkpoint and the date-stamped report retire. The envelope is the only state, `npm run status` counts statuses from it, and `--reset-checkpoint` disappears with them.
- Two ADRs record the decisions that are hard to reverse: the client-side Selection Page, and the envelope as the only state.

The user can then scan once, look at one page, tick a handful of items with confidence about which post each belongs to, export, purge, and see on the same page what was purged, what failed, and what they left alone.

## User Stories

1. As a user who wants to purge selectively, I want a page listing everything a scan found, so that I choose from my own data instead of from a JSON file.
2. As a user, I want that page to open by itself after a scan, so that scanning and reviewing is one step.
3. As a user, I want the page to open in my default browser rather than the automation browser, so that the window I read is the browser I actually use.
4. As a user, I want the scan to print the page's relative path, so that I can paste it myself if the automatic open fails or I close the tab.
5. As a user, I want one page and one envelope per item type, with fixed names, so that I never wonder which of several files is the current truth.
6. As a user, I want the page to show reaction type, post author and date for each item, so that I recognise what I am about to delete.
7. As a user, I want to see the text of my comment with the post it belongs to, so that I can decide whether to delete it without opening LinkedIn.
8. As a user, I want a short excerpt of the post for a reaction, so that I know which post my like is attached to.
9. As a user, I want a link column when the scan captured links, so that I can verify an item on LinkedIn before deleting it.
10. As a user, I want the link column hidden entirely when no item has a link, so that the page does not show me a column of empty cells.
11. As a user, I want empty cells rather than placeholder text in the link column, so that the table stays quiet and scannable.
12. As a user, I want to filter by reaction type, by author name and by date range, so that a 400-item history becomes a short list in a few clicks.
13. As a user, I want a master checkbox that selects every row matching my current filter, and only those, so that filtering cannot silently add items I excluded.
14. As a user, I want the counts of selected, matching and total items always visible, so that I know exactly what an export will contain.
15. As a user, I want to export my selection to a file, so that the choice I made in the page is what purge acts on.
16. As a user, I want the exported file to be the same envelope shape a scan writes, so that purge needs no separate input format.
17. As a user, I want purge to match items by stable identity rather than position, so that a card I picked yesterday is the card that gets deleted today.
18. As a user, I want purge to stop as soon as every selected item has been dealt with, so that I do not pay for walking a history I do not care about.
19. As a user, I want an item that cannot be found to be reported as not found, so that a missing card is visible rather than silently skipped.
20. As a user, I want a failed toggle or delete to be reported as failed and retried on the next run, so that a rate limit does not force me to redo the whole selection.
21. As a user, I want an item I did not select to be marked as untouched, so that the page tells me the difference between "left alone" and "attempted".
22. As a user, I want the page to be regenerated with the purge results, so that the state after a run is the same page I selected from.
23. As a user, I want the envelope written after every action, so that an interrupted purge keeps the results it earned instead of losing the run.
24. As a user, I want `npm run status` to read the envelope, so that progress is one command with one source of truth.
25. As a user, I want one status vocabulary across the page, the envelope and the CLI, so that "purged", "failed", "not found" and "left alone" mean the same thing everywhere.
26. As a user, I want links to cost nothing unless I ask for them, so that a routine deep scan of hundreds of items is not slowed by hundreds of menu interactions.
27. As a user, I want the help screen to state the cost of `--links`, so that the choice between speed and links is informed.
28. As a user, I want the scan to end with a short summary of what it found, so that I know whether the walk looked healthy before I read the page.
29. As a user, I want scanning again to reset the previous run's statuses, so that the page always describes the last scan, not a mix of runs.
30. As a user, I want purge to accept a selection made from the current envelope and refuse to act on items it cannot match, so that nothing is deleted by guesswork.
31. As a maintainer, I want the page generated by one tested function from the envelope, so that the page and the JSON cannot disagree.
32. As a maintainer, I want the status transitions owned in one place, so that the runner cannot invent a status the page does not understand.
33. As a maintainer, I want Card Identity extraction to be a pure function with a test, so that a LinkedIn markup change fails a test rather than corrupting an identity.
34. As a maintainer, I want the live page check extended to cover Card Identity and link capture, so that the expensive, DOM-dependent parts have a real-boundary test.
35. As a future reader, I want ADRs for the client-side page and for the envelope as the only state, so that neither decision is quietly reversed.

## Implementation Decisions

- **Card Identity.** Every real card carries an ancestor element whose id begins `expanded` and ends with the feed-type suffix. The token between them is `base64url(sha256(activity URN))`, verified against a card whose URN was also in the DOM. Card Identity is that token: stable across reloads, unaffected by other activity, and available for every item card at no extra page interaction. Items store it as `cardId`; the page never displays it. Extraction is one pure parse of a container id string plus the in-page ancestor walk.
- **Envelope fields.** Per item: existing `key`, `state`, `author`, `postHref`, `dateTime`, `step`; new `cardId`, `text` (a comment's body, null for reactions, capped at 280 characters), `postExcerpt` (first 140 characters of the post body, null when absent), `itemHref` and `postHref` (links, only with `--links`; `itemHref` is the comment link for a comment and the post link for a reaction, `postHref` is the post link when the card's own DOM exposes one, which is rare), and `status`. Top level keeps `type`, `count`, `keys`, `items`, `scannedAt`, `steps`, `complete`, and gains nothing.
- **Purge Status.** Exactly five values: `no-op` (not selected), `pending` (selected, not yet acted on), `purged`, `failed` (LinkedIn refused or the interaction did not take), `not-found` (selected, never matched on the page). A fresh scan writes `no-op` for every item. `purged` is final; `pending`, `failed` and `not-found` are retried by the next purge of the same selection. The transition rules live in one module, and both the runner and the status command read them from there.
- **Selection.** A subset of a scan's Purge Items, chosen on the Selection Page and exported as the same envelope shape holding only the selected items, each with `status: pending`, `count` and `keys` narrowed to them, `scannedAt` preserved and `selectedAt` added. The exported file is named `selection-<type>.json` with no timestamp, matching the fixed-name rule for every file the tool writes; a browser that already has one may suffix it, which is the browser's business.
- **Selection Page.** One committed, self-contained HTML template with no build step and no dependency; the generator embeds the envelope JSON inline and writes `data/selection-<type>.html`, overwriting the previous one. The page reads files only through the embed: no picker, no fetch, no server. Export builds the selection JSON in memory and triggers a download through a link with a `download` attribute. Filters are reaction state (multiselect), author (case-insensitive contains) and date range; sorting by date and by author. The status column is always present; the link column appears only when at least one item has a link, and cells for items without one are empty. `cardId` and `key` are never displayed.
- **Selection logic is one function, shared.** The transformation from the page's ticked rows to a selection envelope is a small pure function that the generator inlines into the page and the Node tests import directly, so the page and the tests cannot drift.
- **Scan output.** After each type the scan prints a short summary (items found, first-render count, steps, complete, link-bearing count when `--links` was used) and the page's relative path, then opens the page in the **OS default browser** - never the Playwright Chromium, which is an automation engine with its own portable profile and is unrelated to what the user browses with. Opening is best effort: on failure the printed path is the fallback, and the scan does not fail because a browser could not be launched.
- **`--links`.** Opt-in flag (and `behavior.links` in config, CLI wins), default off, costing about 0.8 s per item: open the card's control menu, poll up to 2 s for the menu, click "Copy link to post" (reactions) or "Copy link to comment" (comments), and capture the URL by hooking the page's own clipboard write, retrying once, then null. The constants live in the module; no new config key. The help screen states the cost per item.
- **Walking purge.** Purge no longer trusts positions. It reads the selection, matches cards by Card Identity while walking the Activity List through the existing load-step operation, and acts only on selected items whose status is not `purged`. It stops when every selected item is final, and marks any selection it never matched as `not-found` once the list is exhausted. The existing reaction toggle and comment delete flows are reused, keyed by the matched card.
- **Persistence.** A store module owns the envelope file: load, mark one item's status, and save atomically (temporary file plus rename) after every acted item, so an interrupt or a crash keeps earned results. The runner holds no state of its own.
- **Retirements.** The checkpoint store, the date-stamped report writer, `--reset-checkpoint`, and the checkpoint-based status command all go. Old `data/checkpoint-*.json` and `data/report-*.json` files are ignored, not migrated: this tool has no other users, and the envelope is now the record.
- **Page refresh after purge.** The purge rewrites the page from the updated envelope and opens it in the default browser, always - the automation browser's headless setting has no bearing on what the user sees.
- **ADRs and vocabulary.** ADR 0003 records the client-side Selection Page (static file, embedded data, browser download, no server). ADR 0004 records the envelope as the only state (retiring checkpoint and report). The glossary gains Selection and Purge Status, and retires Checkpoint and Report Entry when the change lands.
- **No new dependency, no build step, no server, no database.**

## Testing Decisions

- **What makes a good test here:** external behaviour at a seam, never DOM internals. Pure functions for anything the page and the CLI must agree on; scripted fakes for anything that talks to a page; a temp directory for anything that touches the envelope file. The live page check covers the DOM-dependent half, per the existing exemption for the injected single-file script.
- **Seams, in order of preference:**
  1. The existing **Activity Loader fake-page seam** for the walking purge: a fake page scripts card batches, Card Identities and delete outcomes, so stopping rules, matching, and status assignment are tested without a browser. Prior art: the loader tests and the purge runner tests with in-memory adapters.
  2. A new **envelope store seam**: the store as a function over a directory, tested for load, mark, atomic save, unknown item, and an interrupted sequence (mark, save, reload).
  3. A new **selection page generator seam**: a pure function from envelope plus statuses to HTML, tested for embedded data, hidden link column versus shown with empty cells, escaping of user text, status column, and that the inlined selection function matches the module's own behaviour.
  4. A pure **Card Identity** parser: one function from a container id string to a token or null, with cases for the two prefix forms, the suffix, a malformed id, and a missing hash.
  5. The existing **`verify:page` live check**, extended to assert Card Identity on both tabs and, only when asked, one link capture with a bounded budget.
- **Status transitions** are tested through the store seam: `no-op` default, `pending` on selection, `purged` final, `failed` retryable, `not-found` after an exhausted walk, and that a second run skips `purged` and retries the rest.
- **Page generator and selection function** are tested together: a fixture envelope, a ticked set, and the expected selection envelope, so the export contract has one test rather than two drifting ones.
- **The status command** is tested against a temp envelope for its counts, replacing the checkpoint-based test.
- **Field verification on the live profile**, recorded in the commit message: a deep likes scan with `--links` produces cards, excerpts, a link-bearing subset and a page whose path opens; a purge of a two-item selection marks them and regenerates the page; a purge of an unselected item's selection ends without touching anything.

## Out of Scope

- The parked `confirm-eof` spec: a non-interactive confirmation still hangs on closed stdin.
- The parked `deep-scan-scale` spec: the large-history stall, the two-step batch cadence, and scan-level partial writes. The per-item envelope write here mitigates purge interrupts only, not scan stalls.
- More than one saved scan or selection per type. The last scan is the truth by design.
- A CLI filter, a terminal picker, or any server-side UI.
- Migrating or reading old checkpoint and report files.
- Changing comment key derivation; `key` stays the page-local handle alongside `cardId`.
- Making the Playwright Chromium the default browser, or reusing the user's Firefox profile for automation.
- Retry/backoff policy changes beyond mapping an existing failure to the `failed` status.
- Any change to the scan walk's stopping rules or the growth signal.

## Further Notes

- Probe facts behind the decisions: Card Identity equals `base64url(sha256(urn))`, verified against a card whose URN was in the DOM; the reactions menu item is "Copy link to post" and the comments one is "Copy link to comment"; capture through the page's own clipboard write worked 5/5 on comments once the menu was polled, at 0.76 to 1.01 s per item; reactions measured 0.72 s; the captured URLs are `lnkd.in` short links; only about a quarter of cards expose a post permalink in their DOM, which is why `postHref` and `itemHref` are separate.
- The text and excerpt fields cost no extra page interaction: they come from the same card walk that already reads author and date.
- Design risk: link capture opens menus, and hundreds of menu visits may invite throttling on a large history. `--links` is opt-in for that reason, and a future pacing knob can sit on top of the same step.
- Design risk: statuses are overwritten by the next scan, by design. A user who scans again before finishing a purge loses the previous statuses, which is the intended meaning of "the last scan is the truth".
- The parked `key-drift` spec is superseded: its problem statement and evidence remain useful history, but the solution here replaces its card-identity and direct-link requirements.
