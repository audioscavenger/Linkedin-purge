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

# Delete comments + reactions, with dry-run confirmation
npm run purge

# Only reactions, reset prior checkpoint
npm run purge -- --type likes --reset-checkpoint

# Progress
npm run status
```

## Pacing

Moderate defaults: 2-5s between actions, 30-60s pause after every 10 deletions.
Override with `--action-min`, `--action-max`, `--batch-min`, `--batch-max`.

## Safety

- Dry-run scan + explicit `YES` confirmation before any deletion.
- Checkpoint saved every 10 deletions; Ctrl+C stops after the current item.
- JSON report written per run under `data/`.

## Disclaimer

Unofficial. Automating LinkedIn may violate its Terms of Service and can trigger
rate limits or temporary account restrictions. Use conservative pacing for
large histories.