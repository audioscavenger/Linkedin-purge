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
# Count items without deleting (first render only)
npm run scan -- --type comments
npm run scan -- --type likes

# Count the whole activity list, not just the first page
npm run scan -- --type likes --deep
npm run scan -- --type all --deep

# Delete comments + reactions, with dry-run confirmation
npm run purge

# Only reactions, reset prior checkpoint
npm run purge -- --type likes --reset-checkpoint

# Progress
npm run status
```

## What a scan covers

Plain `scan` collects the first render only: about 20 cards per tab, of which 18
to 19 count as liked cards on the reactions tab and 20 are comment cards. It
finishes in seconds and is useful as a smoke test, but it is a page, not a
total.

`--deep` walks the whole Activity List instead, one load step at a time, until
the list stops growing. On the live profile each step added about 8 to 10 cards;
the probe reached 138 reaction buttons in 11 steps and roughly 25 seconds. The
command prints one line per load step with the running item count, the delta and
the wait it cost, then a final line with the total, the number of steps and
whether the walk completed.

A deep walk that runs into `timing.timeout` still writes its file, marked
`"complete": false`, and warns that the walk stopped early: the file holds what
was collected up to that point. Every item also carries the load step it first
appeared in (`step`), and the envelope carries `steps` and `complete` next to the
unchanged `type`, `count`, `keys`, `items` and `scannedAt`, so files written
before and after this change both load through `purge --input`.

### Step numbers are attempt indices

`step` is the index of the load step in which a card was first seen,
counting the first render as step 0. It is not a card count and not a page
number, so gaps are normal: a load step that found nothing new still consumes
its number. The live likes scan recorded steps 0, 2, 4, 7, 8, 11, 13, 15, which
means steps 1, 3, 5, 6, 9, 10, 12 and 14 scrolled without adding a card yet. A
gap says "that attempt added nothing", not "items are missing". A plain scan
puts every item in step 0.

## Parameters

The following command-line parameters are accepted:

- `--type` - Type of items to process: `comments`, `likes`, or `all` (default)
- `--deep` - Walk the whole Activity List instead of collecting the first render (default: false; scan only; also `behavior.deepScan` in `config.json`)
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
- `--help` / `-h` - Show the full usage screen with parameters and examples (works with any command)

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
    "growthWait": 3000,
    "maxEmptyScrolls": 8,
    "maxRetries": 4,
    "backoffBase": 10000,
    "batchSize": 10,
    "timeout": 3600000
  },
  "paths": {
    "profileDir": "E:/wintools/PortableApps/chromium-win64/profile",
    "dataDir": "data",
    "chromiumPath": "E:/wintools/PortableApps/chromium-win64/bin/chrome.exe"
  },
  "behavior": {
    "headless": false,
    "limit": 0,
    "resetCheckpoint": false,
    "deepScan": false
  }
}
```

`behavior.deepScan` is the persisted default for `--deep`, so a config file can
turn every scan deep and a command line flag still wins. `behavior.headless` is
the default for purge/login; scan defaults to headless regardless (override with
`--headless`).

### growthWait is a growth deadline, not a sleep

`timing.growthWait` (ms) used to be a fixed sleep after each scroll. It is now
the deadline one load step waits for the Activity List to grow: the tool reads a
growth signal, scrolls the list to its bottom, then polls every 300 ms until the
list grows or this deadline expires. A productive step ends as soon as cards
appear. The default is now 3000, so eight fruitless steps in a row
(`timing.maxEmptyScrolls`) cost about 24 seconds of silence before the end of the
list is declared.

`config.json` is written on first run and gitignored, so every install keeps its
own value; the built-in default is 3000. A smaller value does not lose items that
are there, but each step gives the page less time to answer: more load steps end
fruitless and get retried, and the end of the list is declared after 8 x the wait
rather than 8 x 3000 ms, so a slow page can be mistaken for the end of a list
that had more cards.

### timeout caps a walk; 0 means no limit

`timeout` (ms) is the overall limit for a deep scan of one type, and for a purge
run. For a deep scan, `0` means no time limit, the same way `--limit 0` means
unlimited: the walk then ends only when the list stops growing, never because the
clock ran out. `null` does not disable the cap: `null` is not a number, so the
built-in default of 3600000 (one hour) applies for both scan and purge, exactly
as it does when the key is left out. To run longer but still bounded, raise the
number. A plain scan reads one page and never consults the timeout at all.

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
```

Every scan writes `data/scan-<type>.json` in the scan envelope that
`purge --input` reads, with the walk's facts added:

```jsonc
{ "type": "likes", "count": 2,
  "keys": ["reaction:0", "reaction:2"],
  "items": [
    { "key": "reaction:0", "state": "Like", "author": "...", "postHref": "...", "dateTime": "...", "step": 0 },
    { "key": "reaction:2", "state": "Love", "author": "...", "postHref": "...", "dateTime": "...", "step": 4 }
  ],
  "scannedAt": "2026-10-27T09:12:44.001Z",
  "steps": 15,
  "complete": true }
```

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
# Full usage screen: parameters with defaults + examples
npm run help
npm run <command> -- --help     # e.g. npm run purge -- --help

# Check all source files for syntax errors + run unit tests
npm run check

# Quick health check: syntax + tests + pre-commit hook status
npm run health
```

The repo includes a Husky pre-commit hook that automatically runs `npm run check`
before every commit. If it's not active after cloning, run `npx husky install`.
