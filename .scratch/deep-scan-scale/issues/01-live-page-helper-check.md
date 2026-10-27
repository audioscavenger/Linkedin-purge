# 01: Live page-helper check (detect LinkedIn structure changes)

**What to build:** One command that opens the real activity pages headless and asserts that every in-page helper still behaves as the tool assumes, so a LinkedIn markup change fails loudly here instead of silently producing a scan of 0 items, a scroll target of nothing, or a growth signal that never moves.

The check is the missing half of the test story for the injected helpers: they cannot be unit-tested without a browser, so this pins them at the real boundary, with no fake DOM. It is deliberately not part of `npm run check`: it needs a logged-in profile.

Assertions, on both activity tabs (`reactions/` and `comments/`):

- The page is recognised: `isReactionsPage()` / `isCommentsPage()` is true for the tab just opened, and false for the other.
- `readGrowthSignal()` returns a positive scroll height, a card count of at least one, and a last key that is not null.
- `scrollActivityListToBottom()` names the element it used, and the card count grows after at most three scroll-and-wait cycles, which proves the list actually paginates and that the scroll target is the right element (today: `MAIN#workspace`). Scroll height alone is not proof: a layout shift moves it by a few pixels, so the count is what counts.
- `collectItems([])` returns items that each carry a key and the metadata fields the envelope promises; keys are unique.
- `collectItems(seenKeys)` returns only keys that are not in the list it was handed, which is the incremental contract the walk depends on.
- Every page call is bounded: a helper that never returns fails the check with the helper's name and the step, instead of hanging the command.

On failure the output names the helper, what was expected, and what was observed (for example "scrollActivityListToBottom: scroll height did not increase after one scroll; target reported DIV#workspace, count 20 before and 20 after"), so the reader can tell a markup change from a network hiccup. Exit non-zero on any failure.

Name the command for what it checks (`npm run verify:page` or similar), document it in the README's Development section as requiring a logged-in profile, and note in its output that it is not part of `npm run check`.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] One command opens both activity tabs headless and runs the assertions above against the real page
- [x] Tab recognition, growth signal, scroll target plus real pagination, item metadata, unique keys and the incremental seen-key contract are all asserted
- [x] Each page call has a bound, and a hung call fails with the helper name and step rather than hanging the command
- [x] Failures name the helper, the expectation and the observation, and exit non-zero
- [x] Passing output is short: one line per tab with the card count, the scroll target and the growth it observed
- [x] The command is documented in README Development as needing a logged-in profile, and stays out of `npm run check` and `npm run health`
- [x] No new dependency

Live findings (2026-10-27, first three runs of the command):

- The growth signal's `lastKey` was permanently null: it read the last `[role="listitem"]`, and the list ends with tiles that carry no key. Fixed in the in-page helper (walk back to the last keyed card), and this check is now the regression test for it.
- The first version asserted pagination by scroll height alone. It passed on a 40 px layout shift with the card count unchanged, which is a false pass. Tightened to the card count growing within up to three scrolls; the next run showed the true batch (cards 23 -> 33 on both tabs).
- Passing output now: `comments: OK - 23 cards, target MAIN#workspace, cards 23 -> 33, scroll height 17623 -> 25439, 30 items` and the same shape for reactions (28 items).
