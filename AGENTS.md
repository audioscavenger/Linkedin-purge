# AGENTS.md

## Editing files

- The 'edit' tool is completely deprecated and non-functional in this environment.
- No em-dashes anywhere in this repo's prose (docs, `README.md`, `CHANGELOG.md`, ADRs, changesets, code comments). Where a sentence reaches for one, rewrite it instead with a comma, colon, period, parentheses, or a conjunction, whichever the sentence actually wants; never do a blind character substitution.

## Commands

- `npm run scan -- --type comments|likes` (headless by default; override with `--headed`)
- `npm run purge` (headless by default; override with `--headed`; dry-run + `YES` confirmation required)
- `npm run status` (checkpoint progress)
- `npm run login` (open browser; press Enter when logged in)
- `npm run copy-chromium-profile` (close Chromium first — profile DB locked while running)

## Gotchas

- Chromium binary: `E:/wintools/PortableApps/chromium-win64/bin/chrome.exe`; profile source at `.../chromium-win64/profile`. Copy lands in `.profile-chromium/`; default resolution tries `.profile-chromium/` -> chrlauncher profile -> `.profile`.
- Locked-profile recovery: `launchBrowser` self-heals when the profile is locked by a leftover browser from a previous run -- it kills only this tool's own headless/CDP instances and retries the launch. If a browser you have open holds the profile, it prints a one-line hint (with the PIDs) telling you to close it and retry; it never force-kills a user window. Decision logic: `src/browser-recovery.js` (unit-tested in `tests/browser-recovery.test.js`).
- Scan scrolls `#workspace` container (not window/body). Reactions use stable index key `reaction:<index>`, not shared permalink links.
- Checkpoint saved every 10 deletions (`data/checkpoint-<type>.json`); resume automatically on `purge`. Ctrl+C stops after current item.
- Purge loop saves checkpoint and exits when `cfgTiming.timeout` (default 3600000 ms = 1h from `config.json`) exceeded.
- Report writes to `data/report-<type>-<timestamp>.json`; entries include `key`, `ts`, `state`, `author`, `postHref`, `dateTime`.

## Config

- `config.json` (created on first run; persisted, edited by user) holds timing and paths; CLI flags override.
- Timing fields: actionMin, actionMax, batchMin, batchMax, growthWait, maxEmptyScrolls, maxRetries, backoffBase, batchSize, timeout.

## Releasing

- A request to **"bump version + commit + push" means the full release**: do these in order, don't stop after the push.
  1. Bump the `version` in `package.json`.
  2. Update `CHANGELOG.md`: add the new entry and move it into the **Released** section (keep Bugs/Ideas/Unreleased as-is).
  3. Update `README.md` if the change affects usage.
  4. Run `npm run health` and confirm it passes before committing.
  5. Commit, then push to `main`.
  6. **Create an annotated git tag `v<version>`** with the release notes, then `git push origin v<version>`.
- **Tags are the release mechanism.** Do NOT create a Gitea/GitHub "release object" (no API token available here); the pushed tag is what counts.
- Tag format is `v` + version, e.g. `v0.3.1`. One tag per released version; never retag an existing version.

## Navigation

Read `NAVIGATION.md` before exploring the codebase — it maps every module to its purpose and key exports.

## Coding standards

See `CODING_STANDARDS.md` for module depth, seam placement, test expectations, and coding standards.

## Further Notes

- The deletion test confirms this is a deepening opportunity: deleting `PurgeRunner` would not make `cli.js` work; it would need its own rewrite.
- "One adapter means a hypothetical seam. Two adapters means a real one." We have three adapters now, so this is a real seam.
- The domain model should be updated with "Purge Run", "Purge Item", and "ConfirmAdapter" once the spec is accepted.

## Agent skills

### Issue tracker

Gitea issues (via the Gitea MCP server tools). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (GLOSSARY.md + docs/adr/). See `docs/agents/domain.md`.
