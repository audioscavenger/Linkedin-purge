# Changelog

## Bugs

## Ideas

## Unreleased

## Released

- [x] v0.6.0 - Live Dashboard Control Center and comprehensive UI polishing
  - Added a live web dashboard (`npm run dashboard`) served at port 3333 (configurable via `dashboardPort` in `config.json`), automatically opening in the OS default browser on startup.
  - Added REST scan envelope endpoints, active scan triggers, and an SSE progress stream (`/api/purge/stream`).
  - Added a `/api/shutdown` endpoint with immediate process termination and no unnecessary confirmation popups.
  - Built an advanced single-screen viewport layout (`100vh`) with fixed navbar, toolbar, activity log, and scrollable table workspace.
  - Added row selection checkboxes defaulting to unchecked, respecting active filters during select-all operations.
  - Added column filter search boxes in table headers for Poster, Headline, Post, and Comment/Reaction Type.
  - Added a dynamic Reaction type dropdown listing only scanned reaction types conforming to Glossary terms (Like, Celebrate, Support, Love, Insightful, Funny).
  - Renamed "Likes" to "Reactions" across the UI, documentation, and glossary alignment.
  - Added Post expand/collapse toggle and full post display on hover tooltips.
  - Fixed headline text wrapping without truncation.
  - Unified date normalization avoiding fractional year displays (e.g. "25.1yr").
  - Implemented click-to-edit inline comment editing with generous, fixed-size multi-line textareas and blur-to-revert behavior.
  - Added scan buttons with green loading spinners and toggle-to-cancel functionality.
  - Removed deprecated temporary static HTML selection page generation and browser auto-opening from CLI scan.
  - Relocated parser test artifacts out of the data directory.

- [x] v0.5.10 - Fix selection purge input validation, command line parsing, and reaction index key resolution
  - Fixed selection purge (`purge --input`) so it updates the target JSON envelope in place and skips re-opening browser windows when running with a custom input file.
  - Added strict input validation to `purge --input` to reject `.html` views and require valid JSON scan envelopes.
  - Fixed `LIpurge.cmd` wrapper script argument forwarding by including the `--` separator to prevent npm from interpreting custom flags as npm options.
  - Removed confirmation prompts from selection-based purges (`purge --input`) since items were already interactively selected by the user.
  - Fixed reaction index key (`reaction:N`) resolution during selection purges so items exported from reaction scans are successfully matched and purged.

- [x] v0.5.9 - Oxlint migration and accumulated improvements
  - Migrated linting from ESLint to Oxlint: added `.oxlintrc.json` with the anti-slop plugin (18 rules) and the dash (unicode dash) plugin, wired `oxlint` into `lint-staged` pre-commit and `npm run lint`/`lint:fix`; removed ESLint and its config, plugins, and `eslint.config.mjs`. Cleaned up the lint baseline: auto-fixed 1,309 `require-readable-spacing` errors and manually resolved the remaining 50 errors (`no-runtime-typeof`, `no-array-filter-map`, `no-eval`, `no-useless-spread`, `no-useless-fallback-in-spread`) and all 25 warnings. `npm run lint` is now clean.
  - Added comment-run enforcement for the house two-line `//` comment rule: `npm run check` now fails when three or more consecutive comment lines are found, `npm run fix:comments` merges such runs into block comments, and unit tests cover both.
  - Activity Session owns the browser bootstrap for scan and purge: one module launches (or attaches over `--cdp`), opens the page, injects the helpers, guards the session, derives the profile base URL and parks on each Activity target tab, so the two commands no longer carry their own copy.
  - itemHref is mandatory on every Purge Item; targeted and automated purge without a prior scan (ADR 0005).
