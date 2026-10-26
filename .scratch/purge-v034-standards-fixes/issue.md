# Issue: v0.3.4 — Standards fixes for the v0.3.3 release

Status: ready-for-agent
Origin: code-review of v0.3.3 (fixed point v0.3.2), Standards axis, then grilled to a shared decision record (10 accepted decisions).

## Problem Statement

v0.3.3 (enriched scan output + `purge --input`) shipped without the grill/to-spec flow, and the standards review of that release found real defects the user is now living with:

1. **Reports of destructive actions record wrong data.** The scan path and the delete path in the in-page helpers extract author/date with two different heuristics. The delete path records the *user's own name* (the first `/in/` link is the reactor, i.e. the account being purged) as "author", contradicting the tool's documented intent that author means the post author. The two paths of the tool therefore disagree about the same Purge Item.
2. **Comment deletions record nothing.** Comment delete results carry no metadata at all, so every report entry for a purged comment is null except key and timestamp.
3. **The purge-input format is untested surface area.** The input parser accepts five possible file shapes; the tool itself only ever produces one (the scan JSON envelope). Four speculative shapes have no tests and no stated purpose.
4. **One rule, three implementations.** "Eligible = not yet processed AND in the input set" is implemented in the runner, re-implemented in the injected in-page code, and re-implemented in the test fake.
5. **The changelog lost a release.** The v0.3.3 commit deleted the 0.3.2 entry entirely and re-homed its bullets under 0.3.3. There is now no 0.3.2 line in the changelog at all, and the v0.3.2 tag cannot be retagged.
6. **The record shape has no owner.** The report entry literal is built inline in the runner with ad-hoc null normalization, and the domain terms (Purge Item's metadata, Report Entry, Author) were undefined in the glossary.
7. **Navigation docs are stale.** The module map is missing the scan-collection export and describes the scan command by its pre-v0.3.3 purpose.

## Solution

A bug-fix standards release (**v0.3.4**, no new user-facing capability) that makes the tool's records correct and its rules single-sited:

- One canonical card-metadata extraction, used by scanning and by both delete flows, run on the pristine card before any destructive click — so scanning and purging the same Purge Item always agree.
- Comment deletions carry the same metadata as reaction deletions; report entries are symmetric across types.
- Purge input is exactly the scan JSON envelope; anything else fails with an accurate error. The decision is recorded as an ADR.
- Eligibility is computed once, in the runner; the page adapter receives a precomputed eligible-key list and does membership only.
- The reporter adapter owns the Report Entry: the runner hands over the Purge Item's fields, the reporter stamps the action timestamp and writes the canonical field set.
- The changelog regains its 0.3.2 entry, and 0.3.3 keeps only its own bullets.
- The glossary gains the resolved terms (Purge Item carries metadata; Report Entry; Author) and the module map is corrected.

## User Stories

1. As a user reviewing a purge report, I want the author field of a reaction-deletion entry to be the post author (not my own name), so that the report identifies which post the reaction was removed from.
2. As a user comparing a scan to a subsequent purge of the same items, I want both record types to carry identical author, postHref, and dateTime values for the same Key, so that the reports can be diffed without knowing which path wrote them.
3. As a user purging comments, I want comment-deletion entries to carry state, author, postHref, and dateTime like reaction entries do, so that the report is uniformly useful across both types.
4. As a user who filtered a scan JSON, I want `--input` to accept that scan file and purge exactly the listed Keys, so that selective deletion works end to end.
5. As a user who passes a file in a shape the tool does not produce, I want a clear error naming what was expected, so that I fix the file rather than guessing.
6. As a user resuming an interrupted Purge Run with `--input`, I want keys already in the checkpoint to be ineligible whether or not they are in the input set, so that resume never re-deletes.
7. As a maintainer, I want the eligibility rule implemented in exactly one place, so that a future change to the rule (e.g. adding another condition) is a single edit.
8. As a maintainer, I want the Report Entry's field set owned by the reporter, so that entry shape cannot drift between runner and writer.
9. As a maintainer, I want unit tests proving the input loader's accept and reject behaviour, so the parser stops being an untested wildcard.
10. As a maintainer, I want unit tests through the existing adapter seam covering eligibility as a precomputed list and report-entry construction, so the runner's contract stays pinned to its external behaviour.
11. As a future reader of the repository, I want the changelog to contain a 0.3.2 entry matching what that tag shipped, so that release history is complete and honest.
12. As a future reader of the repository, I want the v0.3.3 changelog entry to describe only 0.3.3's own work, so that no release claims another release's changes.
13. As a future maintainer, I want an ADR explaining why purge input is scan-envelope-only, so the narrow contract isn't re-widened by someone who didn't make the trade-off.
14. As a newcomer reading the module map, I want the scan command's purpose and the in-page export list described accurately, so that navigation matches reality.
15. As a newcomer reading the glossary, I want Author defined as the post author and never the purged account, so that the one word that caused the report confusion cannot be misused again.
16. As a user of the `--input` workflow, I want the tool to fail loudly on malformed JSON, so that a typo in my filtered file cannot become an empty or unexplained run.
17. As a release engineer, I want this batch shipped as v0.3.4 with the standard bump/changelog/health/commit/tag sequence, so that the fix is distributed and auditable like every other release.

## Implementation Decisions

Accepted in the grilling round (all ten decisions, Q1–Q10, answered yes):

- **Single canonical extractor.** The in-page helpers keep exactly one card-metadata extraction routine (the scan path's, which reads the post-author control-menu label first, skips the reactor's own profile link, and falls back in order: other profile links, company links, then date text and then the `<time>` element). Both delete flows call it on the card **before** the destructive interaction, because the post-click DOM is no longer the card we are recording. The reaction flow's separate extraction block (first profile/company link, `<time>`-then-aria-label date walk) is deleted.
- **Comment-flow parity.** The comment delete flow (menu → delete option → confirm modal) extracts the same card metadata before the first click and returns the same result shape as the reaction flow: key, state, author, postHref, dateTime.
- **Eligibility single-sited.** The runner computes the eligible keys (not in the checkpoint AND in the input set, when one is given) and passes that one precomputed list to the page adapter's delete-first-eligible operation. The in-page implementation degrades to a membership test over the passed list. The test fake's copy collapses with it. The adapter interface (and therefore the test surface) changes from two key-list parameters to one eligible-key list.
- **Reporter owns the Report Entry.** The runner passes the Purge Item's fields to the reporter's write operation; the reporter stamps the action timestamp and owns the canonical entry field set (key, ts, state, author, postHref, dateTime). Inline null-normalization in the runner goes away.
- **Input is the scan envelope, per ADR.** The input loader accepts the scan JSON envelope: item metadata from `items[].key`, falling back to `keys[]`; anything else (bare arrays, lone-key objects, item arrays of strings) is rejected with an error that names the expected shape. The four speculative shapes are deleted, not deprecated. Recorded as ADR 0001, created because the decision is hard to reverse once shipped, surprising without context, and the product of a real trade-off.
- **Changelog restoration.** Re-insert the 0.3.2 entry exactly as it stood at the v0.3.2 tag, directly above the 0.3.3 entry, and reduce the 0.3.3 entry to its two genuine bullets (enriched scan output; `--input` feature).
- **Documentation refresh.** The module map's in-page export list gains the scan-collection function, and the scan command's entry is reworded to its current purpose (collects rich Purge Items, not bare keys).
- **Glossary (done in this session).** Purge Item now states it carries its card metadata; Report Entry and Author are new entries.
- **Ship shape.** Version 0.3.4: bump, changelog, health check, commit, push, then annotated tag v0.3.4 with release notes — the full AGENTS.md release sequence. No retagging of v0.3.3.

## Testing Decisions

- **What makes a good test here:** exercise only external behaviour at the seams — the adapter contract and the input loader's input/output as a function — never internal DOM walking. Deterministic, in-memory where possible, no browser or TTY.
- **Existing runner/adapters seam** (prior art: the current purge test file with its in-memory page, checkpoint, reporter, and confirm fakes):
  - the fake page adapter's delete-first-eligible becomes a plain membership check over the eligible list, mirroring the simplified contract;
  - retain and adapt the three existing tests (happy path, input-filter, confirmation abort) to the new single-list interface;
  - add coverage that checkpoint-processed keys are excluded even when present in the input set;
  - add coverage that the reporter's captured entries carry the canonical field set with the timestamp stamped by the reporter (proving the Q8 construction-site decision at the writer seam).
- **Input-loader seam (new test file):** the loader as a pure function over a fixture file — happy path via the items envelope, happy path via the keys fallback, rejection of a bare key array with the named-shape error, and malformed-JSON failure.
- **No DOM harness.** The in-page helper module stays covered behaviourally and by the single-extractor refactor itself (the divergence is structurally impossible once only one extractor exists). The scan → `--input` → purge round-trip is the field verification on a live profile, per the module's documented exemption for the injected single-file script.
- `npm run test` and `npm run health` must pass before the release commit.

## Out of Scope

- No DOM test harness (no jsdom or equivalent dependency), per the module-depth standard's exemption for the injected single-file script and the one-seam preference.
- No change to Key derivation (comment element IDs, reaction index keys), checkpoint format, or the scan JSON envelope itself — its shape is now a contract, not an implementation detail.
- No change to pacing/timing behaviour, batch logic, retry/backoff, or timeout semantics.
- No acceptance of hand-written alternate input formats — that is exactly what the ADR rules out.
- No re-tagging or rewriting of v0.3.3; that tag is frozen.
- No changes to the re-export shim entry point or the CLI's flag/config precedence — both predate this issue and behave correctly.

## Further Notes

- v0.3.3 is the one release that skipped the grill → to-spec flow; this issue is the product of running that flow retroactively on the Standards axis of its diff. The Spec axis was unassessable for v0.3.3 (no spec existed) and is satisfied by this document for the fix release.
- The review's changelog finding was refined against the tag: the defect is a *missing* 0.3.2 entry, not duplicated bullets — verified by diffing the changelog at v0.3.2 against main.
- The review's worst finding (divergent extraction in the in-page helpers) is a correctness bug in records of destructive actions, not merely a smell; this spec treats it as the load-bearing fix.
- "author" is now glossary-defined; any future code that stores an identity on a Purge Item must mean the post author, or the glossary must change first.
- One-seam status: after this change the test surface is the adapter contract plus one pure function. The eligibility rule, the entry shape, and the extraction all have exactly one owner.
