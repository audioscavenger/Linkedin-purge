# 01: Deep scan end to end (likes and comments)

**What to build:** `scan --deep` collects the whole Activity List for the requested type, end to end and demoable in one command. The page is scrolled to the bottom of its activity container, the tool polls until new cards arrive, only cards it has not seen yet get their metadata read, and the walk ends cleanly when the list stops growing or is cut short by the timeout. The scan file records the load step each item first appeared in, how many steps the walk took, and whether it completed, so a partial result is honest. Plain `scan` keeps returning the first render only. Progress is one line per load step, and `--deep` appears in the `--help` screen like every other parameter.

Measured expectations from the two live probes (2026-10-26): first render is about 20 reaction buttons of which 18 to 19 are liked cards; each load step after that adds about 8 to 10 cards; the scroll container is the main element with id `workspace`; neither tab virtualizes.

Prefactor, in the same ticket because it clears traps this ticket would otherwise step in:

- Delete the dead legacy configuration module (the one with the duplicate timing defaults that nothing imports; the live CLI configuration module is the only reader of `config.json`). Dropping its line from the navigation index belongs to ticket 03.
- Remove the scan command's unused legacy checkpoint imports.
- Delete the in-page show-more helper and its export, since the walk never clicks inside cards. The purge module still declares an unused wrapper for it; deleting that wrapper is ticket 02's job, not yours.
- Correct the in-page comment that claims unliked cards keep their place "across runs": the card keeps its place within the session and disappears on reload, so reaction indices are session-scoped.

**Blocked by:** None (can start immediately)

**Status:** done

**Touches:** the injected in-page helpers, a new Activity Loader module, the scan command, the CLI configuration module, the CLI help screen, a new loader/envelope test file, the package test/check/lint script lists, the health script, and the deleted legacy configuration module.

**Do not touch:** anything under the purge module (ticket 02 owns it), and never `README.md`, `NAVIGATION.md`, `GLOSSARY.md`, `docs/adr/`, or `CHANGELOG.md` (ticket 03 owns all documentation; do not add a changelog entry here).

- [x] `scan --deep --type likes`, `--type comments`, and `--type all` each collect far more than the ~20 cards of the first render, and the walk works on both tabs
- [x] Plain `scan` still reports the first render only, apart from the new envelope fields
- [x] `--deep` also settable as `behavior.deepScan` in config, CLI wins over config, default false
- [x] `--deep` is listed in the `--help` screen for scan
- [x] No in-card clicking during the walk; pagination comes from scrolling alone
- [x] A productive step ends as soon as new cards appear; a walk stops complete after the configured run of fruitless steps, and stops incomplete on the configured timeout, still writing what it collected and warning loudly
- [x] The envelope carries per-item `step` plus top-level `steps` and `complete`, and every pre-existing field keeps its meaning so old and new scan files both load through `purge --input`
- [x] One log line per load step (step number, item count, delta, wait cost) and a final line with total, steps and completeness
- [x] Card metadata is read only for cards not already seen, so the walk stays linear as the page grows
- [x] The scroll target is derived from a card in the list and falls back through the old chain, and the chosen element is visible in the log
- [x] The dead legacy configuration module is deleted, no reference to it remains in code, and the live CLI configuration module is still the only reader of `config.json` (a scan run still resolves flags from it)
- [x] The scan command no longer imports the legacy checkpoint helpers it never used
- [x] The in-page stability comment describes the measured session-scoped behaviour
- [x] The stopping rules and the envelope are covered by browser-free tests through a scripted fake page (grow then idle, timeout cutoff, never grows, merge/dedupe/step numbering, already-seen key hand-off) and a pure envelope builder (shallow shape, deep-partial shape), both added to the `test`, `check` and `lint` script lists
- [x] The health script runs the same test set as the test script, so the new coverage is not silently skipped by `npm run health`
- [x] Live verification recorded in the commit message: first render about 20, growth about 8 to 10 per step, `complete: true`, item count far above the pre-change 19, for both tabs
- [x] `npm run test` and `npm run check` pass

Live verification (2026-10-27, headless, `--type all --deep`): likes 86 items / 24 steps / complete, first render 18, batches +10 +8 +10 +10 +10; comments 156 items / 53 steps / complete, first render 20, batches of 8 to 12. Both far above the pre-change 19. The walk's growth deadline came from the local `config.json` (`scrollWait: 800`, a gitignored file that predates this change), so several steps needed a second attempt and the end-of-list tolerance was 8 x 800 ms; see ticket 03.

The envelopes those numbers come from are kept outside the repo because `data/` is gitignored: `E:/TEMP/eric/opencode/deep-scan-verify/scan-likes.json` (86 items, 24 steps, `complete: true`, 18 in step 0) and `E:/TEMP/eric/opencode/deep-scan-verify/scan-comments.json` (156 items, 53 steps, `complete: true`, 20 in step 0). They are the on-disk evidence behind this note, not a live re-run.

Re-verification after the review fixes and the config rename (2026-10-27, headless, `--type likes --deep`, `growthWait` 3000): **410 items, 111 steps, complete**, first render 18, batches of 3 to 10, reaction indices 1 to 477. That supersedes the 86-item figure above, which was collected while the local `config.json` still held the old 800 ms deadline: 8 fruitless steps then cost only 6.4 s, so the walk declared the end early and called itself complete at 86. The lesson is the one the spec's user story 7 is about: a short growth deadline turns "complete" into a lie, and the shipped default of 3000 ms found 324 more cards. The comments walk was not re-verified to completion: it reached 317 items by step 63 and then stalled without output until it was killed at 15 minutes; see `.scratch/deep-scan-scale/issue.md`. Evidence: `E:/TEMP/eric/opencode/deep-scan-verify2/scan-likes.json`.
