# 04: Reporter owns the Report Entry

**What to build:** The Report Entry's field set has one owner: the reporter stamps the action timestamp (`ts`) and writes the canonical field set. The runner hands over the Purge Item's fields with no inline null-normalization, so the entry shape cannot drift between runner and writer and is pinned at the writer seam.

**Blocked by:** 03: Eligibility single-sited in the runner (same runner/fake seam — sequenced so each lands green)

**Status:** ready-for-agent

- [ ] The runner passes the Purge Item's fields (key, state, author, postHref, dateTime) to the reporter's write operation; the inline null-normalization is removed
- [ ] The reporter stamps `ts` and owns the canonical entry field set: key, ts, state, author, postHref, dateTime
- [ ] New test at the writer seam: the reporter's captured entries carry the canonical field set, and the timestamp is the one the reporter stamped
- [ ] `npm run test` passes
