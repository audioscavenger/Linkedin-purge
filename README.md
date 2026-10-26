# linkedin-purge

Purge your own LinkedIn comments and reactions (likes) using a real browser
(Playwright) with randomized pacing, checkpointing, and dry-run confirmation.

## Setup (bundled Chromium)

```sh
npm install
npx playwright install chromium
npm run login
```

`npm run login` opens a headed browser; log in to LinkedIn, then press Enter in the
terminal. The session is saved under `.profile/`.

## Setup (reuse chrlauncher Chromium profile)

Your existing profile is at `E:/wintools/PortableApps/chromium-win64/profile`
and is already logged in. Close Chromium first (so its profile files are not
locked), then either use it directly:

```sh
npm run scan -- --profile-dir "E:/wintools/PortableApps/chromium-win64/profile" --chromium-path "E:/wintools/PortableApps/chromium-win64/bin/chrome.exe"
```

or copy it into the project (recommended, avoids lock issues) and run against
the copy:

```sh
npm run copy-chromium-profile
npm run scan
npm run purge
```

The copy lives under `.profile-chromium/`.

## Option C: attach to your running Chromium (no close, no copy)

Enable remote debugging in chrlauncher.ini by adding to ChromiumCommandLine:

```
--remote-debugging-port=9222
```

Restart Chromium, then attach:

```sh
npm run scan -- --cdp http://localhost:9222
npm run purge -- --cdp http://localhost:9222
```

## Usage

```sh
# Count items without deleting
npm run scan -- --type comments
npm run scan -- --type likes

# Delete comments + reactions, with dry-run confirmation
npm run purge

# Only reactions, reset prior checkpoint
npm run purge -- --type likes --reset-checkpoint

# Progress
npm run status
```

## Parameters

The following command-line parameters are accepted:

- `--type` - Type of items to process: `comments`, `likes`, or `all` (default)
- `--profile-dir` - Chromium profile directory path  
- `--data-dir` - Data directory for reports/checkpoints (default: data)
- `--chromium-path` - Path to Chromium binary
- `--cdp` - Attach to running Chromium via CDP endpoint (e.g. http://localhost:9222)
- `--limit` - Stop after deleting n items (0 = unlimited)
- `--headless` - Run browser headless
- `--action-min` - Minimum per-action delay in ms (default 2000)
- `--action-max` - Maximum per-action delay in ms (default 5000) 
- `--batch-min` - Minimum per-10 batch pause in ms (default 30000)
- `--batch-max` - Maximum per-10 batch pause in ms (default 60000)
- `--reset-checkpoint` - Delete checkpoint before run (purge only)

## Configuration

On first run, `linkedin-purge` writes `config.json` in the project root with all
timing and path defaults. Edit it to override — changes apply on the next run.
CLI flags always take precedence.

```json
{
  "timing": {
    "actionMin": 2000,
    "actionMax": 5000,
    "batchMin": 30000,
    "batchMax": 60000,
    "scrollWait": 800,
    "maxEmptyScrolls": 8,
    "maxRetries": 4,
    "backoffBase": 60000,
    "batchSize": 10,
    "timeout": 3600000
  },
  "paths": { "profileDir": null, "chromiumPath": null }
}
```

`timeout` (ms) caps how long a scan or purge run may take before checkpointing
and stopping. Set to `null` to disable.

## Reports

Every purge run writes a JSON report under `data/report-<type>-<timestamp>.json`.
Each entry includes metadata so you can filter later:

```jsonc
{ "type": "likes", "deleted": 1, "items": [
  { "key": "reaction:0",
    "ts": "2026-10-25T21:03:05.874Z",
    "state": "Like",            // reaction type (Like, Funny, Celebrate, Love)
    "author": "Eric Derewonko", // target user or company name
    "postHref": "https://www.linkedin.com/feed/update/urn:li:activity:7507971921796456448/",
    "dateTime": "2026-04-20T15:09:00Z"
  }
] }

## Pacing

Moderate defaults: 2-5s between actions, 30-60s pause after every 10 deletions.
Override on the command line with `--action-min`, `--action-max`, `--batch-min`,
`--batch-max`, or edit `config.json` (created on first run) to persist your
preferred values.

## Safety

- Dry-run scan + explicit `YES` confirmation before any deletion.
- Checkpoint saved every 10 deletions; Ctrl+C stops after the current item.
- JSON report written per run under `data/`.

## Disclaimer

Unofficial. Automating LinkedIn may violate its Terms of Service and can trigger
rate limits or temporary account restrictions. Use conservative pacing for
large histories.

## Development

```sh
# Check all source files for syntax errors + run unit tests
npm run check

# Quick health check: syntax + tests + pre-commit hook status
npm run health
```

The repo includes a Husky pre-commit hook that automatically runs `npm run check`
before every commit. If it's not active after cloning, run `npx husky install`.