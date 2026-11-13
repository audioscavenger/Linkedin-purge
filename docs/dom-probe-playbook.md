# DOM probe playbook

LinkedIn obfuscates its class names and reshapes its markup on every deploy. The
scanner's in-page helpers in `src/linkedin-dom.mjs` read the Activity List, so
whenever LinkedIn changes the DOM, the scan metadata starts coming back empty:
`postExcerpt` null, `text` empty, `author` or `headline` blank, `dateTime`
missing. This playbook is how to find the new selectors and update the helpers
without guessing.

Read it before you touch `src/linkedin-dom.mjs`. It is meant to be re-run, not
read once.

## When to use it

Run the probe when any of these appear in a scan:

- `postExcerpt` is null on every reaction.
- `text` is null on every comment.
- `author`, `headline` or `dateTime` is blank or wrong.
- The `Reaction` column shows no state, or the type is wrong.
- The comment editor's target text is missing.

The scan itself is not the place to debug. The probe is read-only and opens the
page with your own logged-in profile, so it sees the real DOM.

## Marker comments: the rule for every future probe

Before you run the probe again, you must add two marker comments to the Activity
List. They are the exact text the probe searches for, so the update is quick and
the comment extractor is tested against a known string.

The two comments must be:

1. The first comment on the page: `This is comment number 1, link=https://google.com/ - end`
2. The second comment on the page: `This is comment number 2, no link`

The first carries a link, so the probe proves the link extractor. The second
carries no link, so the probe proves the text-only path. Both are the same text
on every run, so the probe can find them by string search instead of guessing
from the live DOM.

The rule is for the agent, not the user: when the DOM extractor fails, remind the
user to add these two comments before you run the probe. The user posts them
through LinkedIn; the agent cannot. Once the user confirms, run the probe and
search for the exact strings.

## The tools

| Tool | What it does |
| --- | --- |
| `scripts/probe-dom.mjs` | The main probe. Opens the comments or reactions tab (first page only, no scroll) and prints, for each of the first four cards: `cardId`, `menuAria`, `LINKS` (href, full text, name span, classes), `TIMES`, `TEXT_CANDIDATES`, `HEADLINE_CANDIDATES`, `TEXT_BLOCKS`, and a trimmed `OUTERHTML`. |
| `scripts/dump-card.mjs` | Writes the full `outerHTML` of one card to `/tmp/card-outer.html` plus every text node with its tag and classes. Use it when the trimmed probe output is not enough. |
| `scripts/probe-like-card.mjs` | Same as `dump-card` but for the reactions tab. Writes `/tmp/like-card-outer.html`. |
| `scripts/parsers/parser-comments.mjs` | Standalone extractor kept for the comments fixture. It is the reference implementation of the `data-testid="expandable-text-box"` selector. |
| `npm run verify:page` | Live check of the injected `window.LP` helpers against both tabs. Asserts tab recognition, growth signal, scroll target, item metadata, unique keys and the seen-key contract. It opens a browser and needs a logged-in profile. |

All three probes are read-only. They never click a card, never delete anything,
and never scroll.

## Commands

```sh
# Comments tab, headed (the default)
node scripts/probe-dom.mjs comments

# Reactions tab, headed
node scripts/probe-dom.mjs likes

# Headless, no visible window
node scripts/probe-dom.mjs likes --headless

# Full outerHTML of one card
node scripts/dump-card.mjs 3
node scripts/probe-like-card.mjs 2

# Live helper check against both tabs
npm run verify:page
```

`config.json` is honored: `profileDir` and `chromiumPath` come from
`config.json` if present, otherwise the default is `.profile-chromium` and an
auto-detected Chromium. The profile must be logged in. Run `npm run login` first
if the session has expired.

## Selector strategy

The order matters. Prefer the stable test id, then the structural class, then the
content-based fallback.

1. **`data-testid` first.** LinkedIn keeps these stable across deploys. The post
   body is `[data-testid="expandable-text-box"]`. This is the selector the
   extractor uses first.
2. **Obfuscated class names last.** The class names change per deploy (`gvyles`,
   `jkf...`, `fa4l40`). A class selector is a fallback for older saved pages, not
   a primary target. `p.gvyles` is kept as a fallback for the November 2026 saved
   pages.
3. **Content-based fallback.** When no selector matches, scan the text-bearing
   elements and pick the longest plausible one, rejecting UI chrome. This is
   `extractText`'s fallback in `src/linkedin-dom.mjs`.

Never hardcode a class name from a single deploy. If the only selector you have
is a class name, write it as a fallback and add a comment saying which deploy it
came from.

## What the probe found in November 2026

These are the findings from the 2026-11-13 probe. They are the starting point for
the next update, not a permanent contract.

- **Post body.** `[data-testid="expandable-text-box"]` inside the card. It is a
  `span` with the post text. The `p` wrapper carries the obfuscated class
  (`jkfl...` in the live DOM, `gvyles` in the saved pages). The `p` is the
  fallback; the `data-testid` is the primary.
- **The "👇" edge case.** A post whose body is only the "👇" emoji is two
  characters. The extractor's `isPlausiblePostText` rejects text shorter than
  five, so that post has an empty `postExcerpt`. That is a real empty, not a
  broken selector.
- **The first `/in/` link is always the viewer.** Both tabs start with the
  viewer's own profile link. The author must come from a non-viewer `/in/` or
  `/company/` link, or from the control-menu `aria-label` (`Open control menu
  for post by X`).
- **Poster links carry a degree suffix.** "Brad Bassham  • 1st", "Yusuf. M •
  3rd+". Strip the suffix.
- **Comment text does not carry `dir='ltr'`.** The comment body is found by
  scanning text-bearing elements and picking the longest meaningful one, not by
  a `span[dir='ltr']` selector.
- **Dates are relative.** "1mo", "1w", "3d", "1mo • Edited". They appear in text
  blocks, not in `<time datetime>`.
- **The viewer badge leaks into the first link text.** "Eric Derewonko Verified
  Profile You ... Implementation Consultant @ ...". Never use the link text
  verbatim for the author; extract the poster name only.
- **Card containers have no `id`.** `div[role="listitem"]` has no `id`, so
  `cardId` is null at probe time. Card Identity is read from the element's `id`
  attribute when present.

## The update workflow

1. **Ask for the marker comments.** The agent must remind the user to add the two
   marker comments from the section above. The user posts them through LinkedIn;
   the agent cannot. Do not start the probe until the user confirms.
2. **Reproduce.** Run the probe on the tab that is broken. Save the output to a
   file in the temp dir so you can read it in full:
   ```sh
   node scripts/probe-dom.mjs comments > E:/TEMP/eric/probe-comments.txt 2>&1
   ```
3. **Find the element.** Search the probe output for the marker text. For the
   comments tab, search for `This is comment number 1` and `This is comment number 2`.
   For the reactions tab, search for the first words of the post you expect. Note
   the tag, the `data-testid` and the classes.
4. **Write the selector.** Add the `data-testid` first. Keep the old class
   selector as a fallback. Update the comment that names the deploy the selector
   came from.
5. **Run the fixtures.** The saved pages are the regression net:
   ```sh
   node tests/fixture-reactions.test.mjs
   node tests/fixture-comments.test.mjs
   ```
   They must pass 18/18 and 20/20. A mismatch names the item, the field and the
   expected value.
6. **Run the health check.** `npm run health` covers the syntax check, the unit
   tests, the lockfile and the pre-commit hook.
7. **Update the fixture.** If the saved page no longer matches the new selector,
   the fixture is the stale one. Re-run the probe against the live page, save the
   new page, and update the expectation next to it. The fixture is the contract:
   it is the page plus the expected output, and the pair travels together.
8. **Update the date.** The probe scripts carry a `LAST VERIFIED WORKING` date.
   Change it when you re-run the probe against the live DOM.

## The fixture contract

The fixtures are the saved pages and the expected output, both under `tests/`:

- `tests/reactions-input-test-202611.html` and `tests/reactions-expected-202611.json`
- `tests/comments-input-test-202611.html` and `tests/comments-expected-202611.json`

The tests load the page into jsdom, run the in-page extractor, and compare the
result to the expectation. A missing expectation skips loudly; an empty
expectation fails. The fixture is the only thing that proves the extractor still
works on a real page, so keep it in sync.

When you update the page, the expectation must be regenerated from the same
page. Do not hand-edit the expectation to match the extractor: that hides the
bug. The fixture is the page, not the extractor's output.

## Gotchas

- **The profile is locked.** The probe launches Chromium against the profile
  directory. If a browser is already open with it, the launch fails. The
  recovery path in `src/browser-recovery.mjs` kills only this tool's own
  headless/CDP instances. Close your own browser window and retry.
- **The first render is slow.** The probe waits 8 seconds after the tab opens.
  A shorter wait reads an empty page.
- **The probe is not the scan.** It opens the first page only. It does not
  scroll. A deep scan's later cards are not in the probe output.
- **Class names are per-deploy.** The `jkf...` names in the November 2026 output
  will not match the next deploy. The `data-testid` names are the ones to keep.
- **The probe is not in `npm run health`.** It opens a browser and needs a
  logged-in profile. Run it by hand.

## Related

- `src/linkedin-dom.mjs` - the in-page helpers the probe updates.
- `src/page-check.mjs` - the live helper assertions behind `npm run verify:page`.
- `scripts/probe-dom.mjs` - the main probe.
- `scripts/dump-card.mjs` and `scripts/probe-like-card.mjs` - the full-card dumps.
- `tests/fixture-*.test.mjs` - the fixture regression tests.
