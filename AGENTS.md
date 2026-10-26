# AGENTS.md

## Editing files

- The 'edit' tool is completely deprecated and non-functional in this environment.

## Commands

- `npm run scan -- --type comments|likes` (headless by default)
- `npm run purge` (headed; dry-run + `YES` confirmation required)
- `npm run status` (checkpoint progress)
- `npm run login` (open browser; press Enter when logged in)
- `npm run copy-chromium-profile` (close Chromium first — profile DB locked while running)

## Gotchas

- Chromium binary: `E:/wintools/PortableApps/chromium-win64/bin/chrome.exe`; profile source at `.../chromium-win64/profile`. Copy lands in `.profile-chromium/`; default resolution tries `.profile-chromium/` -> chrlauncher profile -> `.profile`.
- Scan scrolls `#workspace` container (not window/body). Reactions use stable index key `reaction:<index>`, not shared permalink links.
- Checkpoint saved every 10 deletions (`data/checkpoint-<type>.json`); resume automatically on `purge`. Ctrl+C stops after current item.
- Purge loop saves checkpoint and exits when `cfgTiming.timeout` (default 3600000 ms = 1h from `config.json`) exceeded.
- Report writes to `data/report-<type>-<timestamp>.json`; entries include `key`, `ts`, `state`, `author`, `postHref`, `dateTime`.

## Config

- `config.json` (created on first run; persisted, edited by user) holds timing and paths; CLI flags override.
- Timing fields: actionMin, actionMax, batchMin, batchMax, scrollWait, maxEmptyScrolls, maxRetries, backoffBase, batchSize, timeout.

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

## Agent skills

### Issue tracker

Local markdown issue tracker.

Issues live as files under `.scratch/<feature>/issue.md` in this repo. This is a solo project on a self-hosted Gitea instance without a `gh`/`glab` CLI mapping.

## Workflow

- **Create issue**: Write `.scratch/<feature>/issue.md` with the spec template.
- **List issues**: `ls .scratch/*/issue.md`
- **Read issue**: `cat .scratch/<feature>/issue.md`
- **Close issue**: Move `.scratch/<feature>/` to `.scratch/<feature>.done/` or delete.
- **No labels**: Triage is manual; no label vocabulary needed.

## To-spec publishing

When `to-spec` writes a spec, it creates the issue file at `.scratch/<slug>/issue.md` and prints its path. No external API call.

### Domain docs

Single-context layout: one `GLOSSARY.md` and one `docs/adr/` at the repo root.

- **Consumer rules**
  - **Read `GLOSSARY.md` first** when touching any domain concept. Use the canonical terms in code and docs.
  - **Read `docs/adr/`** before re-litigating a decision. If a candidate contradicts an ADR, surface it only when the friction is real.
  - **Write to `GLOSSARY.md`** when a new term is resolved. Keep it implementation-free: no file paths, no code, no schemas. Only the concept.
  - **Write an ADR** only when all three hold: hard to reverse, surprising without context, result of a real trade-off.

### Navigation

Read `NAVIGATION.md` before exploring the codebase — it maps every module to its purpose and key exports.

### Coding standards

See `CODING_STANDARDS.md` for module depth, seam placement, test expectations, and coding standards.

## Further Notes

- The deletion test confirms this is a deepening opportunity: deleting `PurgeRunner` would not make `cli.js` work; it would need its own rewrite.
- "One adapter means a hypothetical seam. Two adapters means a real one." We have three adapters now, so this is a real seam.
- The domain model should be updated with "Purge Run", "Purge Item", and "ConfirmAdapter" once the spec is accepted.