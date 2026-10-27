# 03: ReporterAdapter implementation

**What to build:** The reporter adapter works end-to-end — it can open a report JSON file, write individual purge item records to it, and close it. Each record includes key, timestamp, state, author, postHref, and dateTime.

**Blocked by:** 01 (Purge Runner module skeleton).

**Status:** done (shipped in v0.3.0)

- [ ] Open a new report file for a purge type
- [ ] Write a purge item record (key, ts, state, author, postHref, dateTime)
- [ ] Close the report file, finalizing JSON
- [ ] File is valid JSON when complete
