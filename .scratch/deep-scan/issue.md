# Issue: scan --deep (full activity walk) and the load-more the v0.3.0 refactor deleted

Status: done (shipped in v0.4.0)
Origin: grilling session on 2026-10-26 (14 accepted decisions) plus two read-only live probes against the user's real account.

## Problem Statement

Since v0.3.0 (the modularization commit), `scan` performs exactly one in-page collection after a fixed 8 second wait. It therefore reports only what LinkedIn renders on first load: 20 reaction buttons of which 18 to 19 are liked cards, and 20 comment cards. The command says "items found" and gives no hint that this is a page rather than a total, so a user with thousands of likes reads "19 items found" and believes it.

The full walk existed before that refactor and was deleted with it, not replaced:

- v0.1.0 collected in a loop: collect keys, click a "show more" affordance, scroll the window, wait, and stop after a run of rounds that found nothing new.
- v0.2.0 corrected the scroll target to the LinkedIn workspace container and collected rich per-item metadata. Its changelog claims "Reactions scan now collects all items instead of only ~6".
- v0.3.0 replaced the whole loop with a single rich-metadata collection, kept the metadata, and lost the traversal.

Two live probes on 2026-10-26 measured the current behaviour:

- First render on the likes tab: 20 reaction buttons, 18 liked, indices 1..19.
- Each load step after that: about 10 more cards (+10, +8, +10, +10, ...). 11 steps took the page from 20 to 138 reaction buttons and 133 liked cards in roughly 25 seconds.
- The comments tab first renders 20 cards and then pages about 10 per step as well.
- Neither tab virtualizes: cards accumulate in the DOM and the lowest index never moved.
- The scroll container is the main element with id `workspace` (`overflow-y: scroll`, client height 848, scroll height growing from 13091 to 86740). The document itself never scrolls.
- Clicking in-card "Load more comments" is not needed for pagination and inflates the DOM: 226 cards in 11 steps with clicks, 95 cards in 8 steps without.

The same refactor also broke purge, which shares this traversal:

- Purge navigates to the activity "all" tab only. Both page detectors fail there, so it collects zero keys and exits with "Purge cancelled or nothing to delete" without deleting anything, for both types.
- Its empty-round branch waits and gives up after 8 rounds without ever scrolling.
- The in-page "show more" helper and the `scrollWait` / `timeout` configuration values survive as dead code and documentation of the traversal that used to exist.

Finally, a comment in the in-page helpers states that unliked items stay in place with state "no reaction", "so the button's index among all reaction buttons is stable across runs and serves as a checkpoint key". The user verified by experiment that the opposite is true: after a reload, the unliked card is gone. Indices are therefore session-scoped, not run-scoped.

## Solution

`scan --deep` walks the Activity List to exhaustion. Plain `scan` keeps its current behaviour (the first render only), because that stays useful for a fast smoke test and for CI-like checks.

- A load step becomes: read the page's growth signal, scroll the Activity List to its bottom, then poll the signal until it grows or a deadline expires. Productive steps finish in well under a second; the deadline only costs time when the list has actually ended.
- The traversal lives in one module with a small interface: read the current items, perform one load step, or collect everything. Scan uses the whole surface now; purge will use the step operation when the parked purge redesign lands, without a second implementation of scroll-and-wait.
- Only cards that have not been seen yet get their metadata extracted, so a full walk is linear rather than quadratic.
- The scan envelope gains the facts needed to trust a deep result: the load step each item first appeared in, how many steps the walk took, and whether it completed or was cut short by the timeout. A cut-short scan still writes what it found, marked incomplete, and warns.
- Progress is visible: one line per load step with the running item count.
- No in-card clicking: scrolling alone paginates both tabs.
- Purge's prerequisites are repaired here (correct tab per type, dead code removed, false comment corrected) but purge keeps its current first-page-only behaviour until the parked redesign.

## User Stories

1. As a user with a long like history, I want `scan --deep --type likes` to collect every liked card, so that my scan report reflects my actual history rather than the 19 cards LinkedIn happens to render first.
2. As a user with a long comment history, I want `scan --deep --type comments` to collect every comment card, so that both types behave the same way.
3. As a user running `scan --deep --type all`, I want both tabs walked in one command, so that I get one consistent report per type.
4. As a user, I want plain `scan` to keep returning only the first render, so that a quick check costs seconds and stays useful for testing.
5. As a user, I want a progress line per load step with the running item count, so that a long scan looks alive instead of hanging.
6. As a user, I want the scan to stop by itself when the list ends, so that I do not have to know how many items I have.
7. As a user, I want a slow page to never be mistaken for the end of the list, so that a deep scan cannot silently under-report.
8. As a user, I want a deep scan that hits its time limit to still write the items it found, marked incomplete, and tell me so, so that a long run is not wasted.
9. As a user, I want each item in a deep scan to record which load step it appeared in, so that I can tell a first-render item from a deep one and see how LinkedIn paged.
10. As a user, I want the scan envelope to keep the same contract it had before (`type`, `count`, `keys`, `items`, `scannedAt`), so that files written before and after this change both work with `purge --input`.
11. As a user, I want the tool not to click buttons inside cards while scanning, because expanding other people's comment threads is not needed to list my own activity and makes the page slow.
12. As a user, I want `--deep` to be a real command line parameter, and also settable in `config.json`, so that I can persist a preference the way I persist pacing.
13. As a user whose deep scan is slow, I want the scroll wait and the overall timeout I already configured to control it, so that I do not learn a second set of knobs.
14. As a user, I want the deep scan to reuse the workspace container it already scrolls, and to keep working if LinkedIn renames or restructures it, so that the tool does not rot with the next UI change.
15. As a user of `purge`, I want it to visit the correct tab for the type it is purging, so that purge stops reporting "nothing to delete" while my history is full.
16. As a user, I want the tool's code comments to describe what actually happens to an unliked card, so that I can reason about keys and checkpoints without being misled.
17. As a maintainer, I want exactly one implementation of scroll-and-wait, so that a future change to pagination is one edit and not two divergent ones.
18. As a maintainer, I want the traversal module tested without a browser through a narrow page seam, so that the stopping rules are pinned by fast deterministic tests.
19. As a maintainer, I want the scan envelope built by one small pure function, so that the documented contract is tested rather than assembled inline at the browser edge.
20. As a maintainer, I want a unit test proving a cut-short walk marks its envelope incomplete, so that "partial result" cannot silently become "everything I had".
21. As a maintainer, I want `npm run test` and `npm run health` to cover the new tests automatically, so that the pre-commit hook catches a regression here the same way it does elsewhere.
22. As a future reader, I want an ADR recording why deep is opt-in rather than the default, so that nobody swaps the default back without seeing the trade-off.
23. As a future reader, I want the glossary to define Activity List, Load Step, Shallow Scan and Deep Scan, so that the spec, the code and the docs use one vocabulary.
24. As a newcomer, I want the navigation index and README to describe the traversal module and the new parameter, so that documentation matches the code.
25. As a user preparing the filter-and-select workflow for purge, I want a deep scan to produce one honest, complete file per type, so that the later selection step has the full set to choose from.

## Implementation Decisions

- **Activity Loader module.** A new module owns the traversal and exposes exactly three operations: read the items currently in the page; perform one load step and report whether the page grew; collect all items. It is constructed with the browser page and the resolved timing values. Scan calls the collect-all operation (deep) or the read operation (shallow). The purge path adapter will call the load-step operation when the parked redesign lands, so the module is written with that second consumer in mind but wired to scan only.
- **Load step semantics.** Read a growth signal, scroll to the bottom of the Activity List, then poll the signal every 300 ms (a constant in the module, not configuration: it is machine latency, not user preference) until it grows or the growth deadline expires. Growth resets the idle counter and the step ends immediately. No growth increments the idle counter. The walk ends when the idle counter reaches the configured empty-scroll limit, or when the configured timeout expires.
- **Timing values, no invented vocabulary.** The growth deadline is `timing.growthWait` (formerly `scrollWait`, renamed before release because it no longer describes a sleep), whose meaning is "how long to wait for growth per load step"; its default rises from 800 to 3000 so that eight fruitless steps mean about 24 seconds of silence before the end is declared. The idle limit stays `timing.maxEmptyScrolls` (8). The overall limit stays `timing.timeout`, where 0 means no limit (matching `--limit 0` and the purge runner) and absent for the one-hour default.
- **Completeness.** A walk that ends because the list stopped growing is complete. A walk that ends because the timeout expired is incomplete: the envelope records `complete: false`, the command warns, and the file is still written with what was collected.
- **Growth signal.** The in-page helpers expose one cheap signal: the Activity List's scroll height, the current item count, and the last item key. Reading it must not extract card metadata.
- **Scroll target.** Prefer the nearest scrollable ancestor of a card in the Activity List, then the element with id `workspace`, then the main landmark, then the document scroller. Measured today: all four land on the same `workspace` element, but the derivation order is what survives a rename.
- **Incremental collection.** The in-page item collectors accept the keys already seen and skip metadata extraction for those cards, keeping only key computation (which is positional or id-based and cheap). The signature gains an optional argument, so existing callers keep working.
- **No in-card clicks.** The load step scrolls and polls only. The in-page "show more" helper is deleted rather than relocated; the probe showed it contributes nothing to pagination and expands unrelated content.
- **Envelope additions.** Per item: `step`, the zero-based load step in which the card first appeared (0 for the first render, and therefore 0 for every item of a shallow scan). Per envelope: `steps`, the number of load steps performed, and `complete`. Everything already in the envelope stays byte-identical in meaning, so the `--input` contract (ADR 0001) is untouched and old and new files both load.
- **Envelope construction is a pure function.** One small function builds the envelope from type, items, steps and completeness, so the contract has a test rather than living inline at the browser edge.
- **Deep is opt-in and also configurable.** `--deep` on the command line, `behavior.deepScan` in `config.json`, CLI wins over config, config wins over the built-in default of false. Deep is not the default, and that default is the subject of ADR 0002.
- **Progress output.** One line per load step: step number, item count, delta, and the wait that the step cost. A final line states the total, the number of steps, and whether the walk was complete.
- **Purge prerequisites, not purge redesign.** Purge visits the tab matching the type it is purging (comments tab for comments, reactions tab for likes), so it stops collecting zero keys on the activity "all" tab. Dead traversal code is removed from the page adapter, the adapter interface file and the test fake. Purge otherwise keeps today's behaviour: it acts on what is on the page and does not walk. Making purge walk, or purge a selected subset, is the parked redesign.
- **Correct the false comment.** The in-page note claiming unliked cards stay in place is replaced with what was measured: the card keeps its place within the session, and disappears on reload. Key stability claims must not rest on the old sentence.
- **Documentation.** README gains `--deep` in the parameter list, the changed meaning of `growthWait`, the new `behavior.deepScan` key, a short "what a scan covers" paragraph, and a warning that plain `scan` reports the first render only. The navigation index gains the loader module and the updated in-page exports. The glossary gains Activity List, Load Step, Shallow Scan and Deep Scan. The changelog gains an Unreleased entry.
- **No new dependencies.** Polling uses the page and the existing timing loop; no scheduler, no DOM library.

## Testing Decisions

- **What makes a good test here:** exercise the module's external behaviour through a fake page that scripts growth signals, not the internals of the polling loop. Deterministic, in-memory, no browser, no filesystem, no sleeping on real timers beyond negligible waits.
- **Activity Loader seam (new test file, prior art: the in-memory adapters of the purge runner tests):** a fake page returns scripted signals and item pages; tests cover:
  - a list that grows for N steps and then idles stops after the configured idle limit and reports completeness;
  - a walk cut short by the timeout reports `complete: false` while keeping the items collected so far;
  - a list that never grows performs exactly the allowed idle steps and returns the first render;
  - items are merged and de-duplicated by key, in first-seen order, and each carries the step it first appeared in;
  - the already-seen keys are handed to the page on every step after the first (the incremental contract), and a page that receives them returns only new items.
- **Envelope seam:** the pure envelope builder is tested for the shallow shape (one step, complete, every item step 0) and the deep partial shape (many steps, incomplete), proving the contract that `purge --input` depends on.
- **Runner seam:** existing purge runner tests must keep passing unchanged, proving the prerequisites ticket did not alter purge behaviour.
- **Registration:** the new test files are added to the `test`, `check` and `lint` script lists so the pre-commit hook runs them.
- **Field verification on the live profile (documented in the ticket, not automated):** a deep likes scan must report about 20 items at step 0, grow by roughly 8 to 10 per step, end complete, and produce a file whose item count is well above the pre-change 19. The comments tab gets the same check.
- **No DOM harness.** The injected in-page helpers stay covered behaviourally and by live verification, per the existing exemption for the single-file injected script.

## Out of Scope

- `purge --deep`, walking during purge, or purging a selected subset. Parked in `.scratch/key-drift/issue.md`.
- Any cross-run identity for reaction cards: no fingerprint field, no permalink per item. The user accepts that positional keys are session-scoped and that the workflow is scan, purge, rescan.
- The parked requirement that every report entry carry a direct link to its card. It needs a per-card link source that does not exist in the current extraction, so it belongs with the purge redesign.
- Checkpoint format or checkpoint semantics.
- Changing the shallow default.
- Supporting a hypothetical virtualized list, or content-based keys. The probes show cards accumulate; the fallbacks in the scroll-target derivation are the only defence kept.
- Retry, backoff, pacing, limit, or confirmation behaviour.
- Reformatting or rewriting the scan envelope's existing fields.

## Further Notes

- Probe 1 also clicked the in-card "load more comments" affordance at every comment step. That is why its comment counts ballooned. Probe 2 repeated the walk with scrolling only and paginated cleanly, which is what settled the no-clicks decision.
- The 19 items in the user's pre-existing scan file are not 19 liked cards: the first render is 20 reaction buttons, one of which is in state "no reaction" and is skipped by the collector. The collector's index therefore counts all reaction buttons, liked or not, which is why keys can have gaps.
- The user's manual unlike during the probe run explains one disappearing card, not the whole shift between the 07:49 scan file and the probe:

  | card (author / date) | scan 07:49 | probe |
  | --- | --- | --- |
  | Yusuf. M / Sep 16 | `reaction:0` | `reaction:1` |
  | Zebraworks / Sep 21 | `reaction:1` | `reaction:2` |
  | Muhammad Ejaz / Sep 20 | `reaction:2` | not in the liked set |
  | Brad Bassham / Sep 8 | `reaction:3` | `reaction:3` |
  | Donald Trump Jr. / Jan 13 | `reaction:17` | `reaction:17` |
  | Jason Dookeran / Jan 11 | `reaction:18` | `reaction:18` |
  | Zebraworks / Jan 13 | `reaction:19` | `reaction:19` |

  Liked count went 19 to 18, the gap stayed at index 16, and some rows shifted while later ones did not. Either way, indices are stable within a page session and not across sessions, which is the fact the corrected comment records. `.scratch/key-drift/issue.md` carries the parked question.
- The parked key-drift issue does not ask for a fix here; it records the evidence and the requirement for a per-card direct link in reports, so the redesign starts from measured behaviour.
- Expected wall clock: a 133-like history takes about 10 load steps and, with polling, roughly 10 to 20 seconds, against 11 fixed 2-second waits before.
- Post-review rename (2026-10-27): `timing.scrollWait` became `timing.growthWait` at the user's direction, since the key no longer describes a sleep and nothing has shipped that depends on the old name. The old key is gone rather than aliased: an install that still has `scrollWait` silently falls back to the 3000 default, which is the intended value anyway.
