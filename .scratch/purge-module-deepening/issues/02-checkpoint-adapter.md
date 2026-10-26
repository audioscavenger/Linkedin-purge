# 02: CheckpointAdapter implementation

**What to build:** The checkpoint adapter works end-to-end — it can load an existing checkpoint set, query whether a key is processed, add keys, persist the set to disk, and reset it. Processed keys survive across runs so items are not re-processed.

**Blocked by:** 01 (Purge Runner module skeleton).

**Status:** ready-for-agent

- [ ] Load checkpoint set from disk, return empty set if none exists
- [ ] Query whether a given key has already been processed
- [ ] Add a key to the processed set
- [ ] Save the processed set to disk as JSON
- [ ] Reset (clear) the checkpoint
