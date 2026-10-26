# 03: Eligibility single-sited in the runner

**What to build:** The rule "eligible = not yet processed AND in the input set (when one is given)" exists in exactly one place: the runner. A future change to the rule is a single edit; the page adapter does membership only over the list it is handed.

**Blocked by:** 02: One canonical card-metadata extraction (this ticket's in-page change is inside the same single injected helper file that 02 rewrites — run sequentially, never in parallel sessions, so a full-file write cannot clobber the other ticket's edits)

**Status:** ready-for-agent

- [ ] The runner computes the eligible list (checkpoint-processed keys excluded, input-set members included when input is given) and passes that one list to the adapter's delete-first-eligible operation
- [ ] The adapter interface carries one eligible-key list, not a skip-keys/allowed-keys pair (test surface changes with it)
- [ ] The in-page implementation degrades to a membership test over the passed list; the test fake's copy of the rule is collapsed with it
- [ ] The three existing tests (happy path, input filter, confirmation abort) are adapted to the new single-list interface and still pass
- [ ] New test: a checkpoint-processed key is not deleted even when present in the input set; an input-only key is deleted (resume never re-deletes)
- [ ] `npm run test` passes
