# linkedin-purge

Purge your own LinkedIn comments and reactions (likes) using a real browser
(Playwright) with randomized pacing and review-first selection: scan once,
review what the scan found on one page, pick the items to delete, export them,
and purge exactly that selection.

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
npm run login-import-profile
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
```

Every scan writes `data/scan-<type>.json` (the scan envelope) and then writes and
opens `data/selection-<type>.html` in your default browser: one page per item
type, with one row per item (checkbox, reaction state, author, date, comment
text or post excerpt, status, and - since links are captured by default - a link column).
Review it, tick the items to delete, and click **Export** to download
`data/selection-<type>.json`, which holds only the ticked items at
`status: todo`. Then purge exactly that selection:

```sh
# Purge only the ticked items from the exported selection
npm run purge -- --input data/selection-likes.json
```

`purge --input` walks the Activity List, matches cards by their Card Identity,
acts on every selected item that is not already purged, and stops as soon as
every selected item is final (purged, failed, or not-found). It writes each
item's status into the scan envelope as it goes, then regenerates the page and
opens it, so you can see on the same page what was purged, what failed, and
what you left alone.

```sh
# Full purge (legacy): act on every item on the page
npm run purge -- --type likes
```

## What a scan covers

Plain `scan` collects the first render only: about 20 cards per tab, of which 18
to 19 count as liked cards on the reactions tab and 20 are comment cards. It
finishes in seconds and is useful as a smoke test, but it is a page, not a
total.

`--deep` walks the whole Activity List instead, one load step at a time, until
the list stops growing. On the live profile each step added between 3 and 10
cards. A full likes walk with the shipped defaults collected 410 cards in 111
steps, about four minutes; one batch often needs a scroll that finds nothing yet
and the next scroll that finds it, which is where the time goes. Time grows with
history size, so a large comment history takes proportionally longer. The
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
- `--deep` - Walk the whole Activity List instead of collecting the first render (default: false; `behavior.deepScan` in `config.json`). Applies to a scan, or to an automated purge without `--input` (crawl-to-purge). Dropped silently when `--input` is present.
- `itemHref` is captured for every item in the scan (it is no longer an opt-in link step): each Purge Item carries a direct link to the item itself, so purge can target individual items without crawling the page first.
- `--limit` - Automation-only: stop after deleting n items per type (0 = unlimited). Only used when purging without `--input`; purge crawls the page and purges up to `limit` items, no scan needed. With `--input`, `--input` always wins and `--limit` only caps how many marked-todo items are purged. `--limit` applies per Activity type, not as a sum across both (`--limit 25 --type all` purges up to 25 comments and up to 25 reactions).
- `--profile-dir` - Chromium profile directory path
- `--data-dir` - Data directory for scan envelopes and selection pages (default: data)
- `--chromium-path` - Path to Chromium binary
- `--cdp` - Attach to running Chromium via CDP endpoint (e.g. http://localhost:9222)
- `--headed` - Run browser headed (override of headless default)
- `--action-min` - Minimum per-action delay in ms (default 2000)
- `--action-max` - Maximum per-action delay in ms (default 5000)
- `--batch-min` - Minimum per-10 batch pause in ms (default 30000)
- `--batch-max` - Maximum per-10 batch pause in ms (default 60000)
- `--help` / `-h` - Show the full usage screen with parameters and examples (works with any command)

`--reset-checkpoint` was removed in v0.5.0: purge statuses now live in the scan envelope, written one item at a time as purge runs, so there is no checkpoint to reset. Passing it exits non-zero without starting a browser.

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
    "headed": false,
    "limit": 0,
    "deepScan": false
  }
}
````

`behavior.deepScan` is the persisted default for `--deep`, so a config file can
turn every scan deep and a command line flag still wins. `behavior.headed` is
the override for the headless default of scan and purge; login stays headed.

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

## Statuses on the page

Every item in the scan envelope carries a Purge Status: `no-op` (not chosen),
`todo` (chosen, not yet acted on), `deleted` (removed from LinkedIn), `failed`
(refused), or `not-found` (card never appeared). A fresh scan starts every item
at `no-op`, so a new scan resets statuses - nothing carries over from a previous
run.

`npm run status` reports per-type counts by status from the scan envelope, and
says "no scan yet" when a type has no envelope yet.

Old `data/checkpoint-*.json` and `data/report-*.json` files from v0.4.0 and
earlier are left untouched and unread: they are not part of v0.5.0.

## Pacing

Moderate defaults: 2-5s between actions, 30-60s pause after every 10 deletions.
Override on the command line with `--action-min`, `--action-max`, `--batch-min`,
`--batch-max`, or edit `config.json` (created on first run) to persist your
preferred values.

## Safety

- Dry-run scan + explicit `YES` confirmation before any deletion.
- `purge --input` stops as soon as every selected item is final; Ctrl+C stops after the current item.
- Nothing is written to disk by the Selection Page itself; it only reads and exports.

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

# Live check of the injected page helpers against your own activity tabs
npm run verify:page

# Quick health check: syntax + tests + pre-commit hook status
npm run health
```

`npm run verify:page` is the live half of the page-helper testing story: it opens
both activity tabs headless and asserts that tab recognition, the growth signal,
the scroll target and real pagination, the item metadata, unique keys and the
seen-key contract all still behave as the tool assumes, failing with the helper's
name when LinkedIn changes its markup. It is not part of `npm run check`,
`npm run lint` or `npm run health`, because it opens LinkedIn with your profile
and needs a logged-in session: run `npm run login` first. It only reads and
scrolls each tab once; it never clicks a card or deletes anything.

### DOM probe: discover selectors when LinkedIn changes its markup

LinkedIn obfuscates its class names and markup to combat scrapers, so the
selectors in `src/linkedin-dom.mjs` will rot over time. When scan metadata
(author, headline, date, text) breaks again, use the DOM probe to discover the
current selectors against the live page, then update the extractor:

```sh
# Dump per-card DOM structure for comments (default) or reactions (likes)
node scripts/probe-dom.mjs                    # comments tab
node scripts/probe-dom.mjs likes              # reactions tab
node scripts/probe-dom.mjs --headless         # no visible window

# Dump full outerHTML + every text node of one comment card to /tmp/card-outer.html
node scripts/dump-card.mjs                    # card index 0
node scripts/dump-card.mjs 3                  # card index 3
```

Both scripts are read-only: no clicks, no deletions, no scroll. Each carries a
`LAST VERIFIED WORKING` date in its header — when scan metadata breaks, re-run
the probe against the live DOM and re-verify that date.

The repo includes a Husky pre-commit hook that automatically runs lint-staged
(ESLint + Prettier) before every commit. If it's not active after cloning, run
`npx husky install`.
