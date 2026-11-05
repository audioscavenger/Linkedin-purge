# Selection Page is client-side, embedded, downloaded, no server

After a `scan --deep [--links]`, the tool writes `data/selection-<type>.html`: a
single self-contained HTML page with the scan envelope embedded as inline JSON,
one row per item (checkbox, reaction state, author, date, comment text or post
excerpt, status, and - only when at least one item has a link - a link column
with empty cells for items without one), a filter bar for reaction state,
author and date range, sorting by date or author, a master checkbox that
selects exactly the rows matching the current filter, and an Export button that
downloads `selection-<type>.json` holding only the ticked items at
`status: pending`. The page opens in the OS default browser, never the
automation browser; the scan prints the page's relative path so it can be
re-opened by hand. Nothing is written to disk by the page itself, there is no
picker, no server, and no Card Identity or item key is rendered - those are
implementation detail.

The trade-off is deliberate: the review step happens in a static file the user
already trusts (their own browser), so the scan can never mutate what the user
sees between scan and purge, and the exported selection envelope is the only
thing purge --input acts on. Rendering everything client-side from embedded
data keeps the page offline-capable and free of a server the tool would have to
run, host, and secure.

It qualifies as an ADR because it is hard to reverse: once the README, the
changelog and the habit of scanning-then-reviewing-in-the-browser all assume a
static page with an embedded envelope and a browser download, adding a server,
a picker, or server-side state is a breaking change to the documented flow, not
an edit. It is surprising without this context, because "export" reads like a
convenience download when it is actually the only write path purge --input
honors, and because the link column's presence depends on the data rather than
being a fixed column. And it is the product of a real trade-off: a server
would let the tool persist selections across machines, but it would also be the
part most likely to break, be out of date, or leak the very activity the tool
exists to remove, so the page stays a read-only, client-side, downloaded
artifact.

Spec: `.scratch/purge-v050/issue.md` (v0.5.0 spec; ticket 09:
`.scratch/purge-v050/issues/09-selection-page-generator-data-columns-status-link-column-rule.md`,
ticket 10: `.scratch/purge-v050/issues/10-browser-check-harness-for-the-generated-page.md`,
ticket 11: `.scratch/purge-v050/issues/11-page-filters-and-sorting.md`,
ticket 12: `.scratch/purge-v050/issues/12-page-selection-rows-master-checkbox-counts.md`,
ticket 13: `.scratch/purge-v050/issues/13-page-export-selection-envelope-download.md`).
