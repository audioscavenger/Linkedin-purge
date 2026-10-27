// Live page-helper check: the injected half of the tool asserted at the real
// boundary.
//
// `window.LP` (src/linkedin-dom.js) is injected into the page and cannot be
// unit-tested without a browser, so a LinkedIn markup change would otherwise
// show up only as a scan of 0 items, a scroll target of nothing, or a growth
// signal that never moves. This module checks one Activity tab and returns one
// result per assertion, each naming the in-page helper, what was expected and
// what was observed. `npm run verify:page` wires a real page to it.
//
// The page seam is five plain functions returning plain data, the same shape the
// Activity Loader takes (plus both page detectors), so the checks run against a
// fake page in tests and Playwright through createCheckPage():
//   isReactionsPage()             -> boolean
//   isCommentsPage()              -> boolean
//   readGrowthSignal()            -> { scrollHeight, count, lastKey }
//   scrollActivityListToBottom()  -> { tag, id }
//   collectItems(seenKeys)        -> [{ key, state?, author, postHref, dateTime }]
//
// Every page call is bounded. A Playwright evaluate has no timeout of its own, so
// a page whose main thread is saturated never returns and the command hangs with
// no output: that is what stalled a 317-item comments walk. Here it fails naming
// the helper and the step it was performing.

// How long one page call may take before it counts as hung.
export const DEFAULT_CALL_TIMEOUT_MS = 15000;
// How often the growth signal is re-read while waiting for a load step to show
// up, and how long that wait lasts. These mirror the loader's POLL_INTERVAL_MS
// and the shipped growthWait default, because the check must exercise the same
// wait the walk relies on.
export const DEFAULT_POLL_INTERVAL_MS = 300;
export const DEFAULT_GROWTH_WAIT_MS = 3000;
// How many scrolls the pagination assertion may try before calling the pager
// dead. A batch that only arrives on the second scroll is normal.
export const MAX_SCROLL_ATTEMPTS = 3;

// The Activity tab each page detector answers for.
const DETECTOR_BY_TAB = {
  reactions: "isReactionsPage",
  comments: "isCommentsPage",
};

const OTHER_TAB = { reactions: "comments", comments: "reactions" };

// The card metadata the collector promises, per tab. Reactions carry a per-item
// state; comments have none (the delete flow, not the collector, stamps
// COMMENTS_STATE into a report). Every item also carries its key.
const METADATA_FIELDS = {
  reactions: ["state", "author", "postHref", "dateTime"],
  comments: ["author", "postHref", "dateTime"],
};

const TIMED_OUT = Symbol("page-call-timed-out");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// "MAIN#workspace", the way the walk's progress line names its scroll target.
export function describeTarget(target) {
  if (!target || (!target.tag && !target.id)) return "no element";
  return `${target.tag || "?"}${target.id ? "#" + target.id : ""}`;
}

function listFields(fields) {
  if (fields.length <= 1) return fields.join("");
  return `${fields.slice(0, -1).join(", ")} and ${fields[fields.length - 1]}`;
}

function summarise(problems) {
  const shown = problems.slice(0, 6).join(", ");
  const rest = problems.length - 6;
  return rest > 0 ? `${shown} (+${rest} more)` : shown;
}

function errorLine(error) {
  return error && error.message ? error.message : String(error);
}

function outcome(tab, step, helper, expected, observed, ok) {
  return {
    tab,
    step,
    helper,
    ok,
    expected,
    observed,
    message: `${helper} [${step}]: expected ${expected}; observed ${observed}`,
  };
}

function pass(tab, step, helper, expected, observed) {
  return outcome(tab, step, helper, expected, observed, true);
}

function fail(tab, step, helper, expected, observed) {
  return outcome(tab, step, helper, expected, observed, false);
}

// Await one page call, but never past callTimeoutMs. The timer is cleared when
// the call wins, so a resolved call leaves nothing pending behind it.
async function boundedCall(fn, callTimeoutMs) {
  let handle = null;
  const deadline = new Promise((resolve) => {
    handle = setTimeout(resolve, callTimeoutMs);
  });
  try {
    const value = await Promise.race([Promise.resolve().then(fn), deadline.then(() => TIMED_OUT)]);
    if (value === TIMED_OUT) return { ok: false, timedOut: true };
    return { ok: true, value };
  } catch (error) {
    return { ok: false, timedOut: false, error };
  } finally {
    clearTimeout(handle);
  }
}

// Check one Activity tab. Returns { tab, ok, facts, results }: `facts` carries
// the numbers the passing line prints (card count, scroll target, growth, item
// count), `results` one named outcome per assertion.
export async function checkActivityTab({
  tab,
  page,
  now = Date.now,
  sleep = wait,
  callTimeoutMs = DEFAULT_CALL_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  growthWaitMs = DEFAULT_GROWTH_WAIT_MS,
}) {
  const detector = DETECTOR_BY_TAB[tab];
  if (!detector) throw new Error(`Unknown activity tab: ${tab}`);
  const otherDetector = DETECTOR_BY_TAB[OTHER_TAB[tab]];

  const results = [];
  const facts = { tab, count: 0, target: null, growth: { from: 0, to: 0 }, items: 0 };
  const finish = () => ({ tab, ok: results.every((r) => r.ok), facts, results });

  // Every in-page call goes through here: bounded, and a failure (timeout or
  // throw) becomes a named result instead of an exception or a hang.
  async function call(step, helperName, fn) {
    const called = await boundedCall(fn, callTimeoutMs);
    if (called.ok) return called;
    const observed = called.timedOut
      ? `no result after ${callTimeoutMs} ms (the call never returned)`
      : `the call threw: ${errorLine(called.error)}`;
    results.push(fail(tab, step, helperName, `a result within ${callTimeoutMs} ms`, observed));
    return called;
  }

  // --- Tab recognition: the opened tab's detector is true, the other is false.
  const opened = await call("tab recognition", detector, () => page[detector]());
  if (!opened.ok) return finish();
  const openedExpected = `true on the ${tab} tab`;
  results.push(
    opened.value === true
      ? pass(tab, "tab recognition", detector, openedExpected, "true")
      : fail(tab, "tab recognition", detector, openedExpected, String(opened.value))
  );

  const other = await call("tab recognition", otherDetector, () => page[otherDetector]());
  if (!other.ok) return finish();
  const otherExpected = `false on the ${tab} tab`;
  results.push(
    other.value === false
      ? pass(tab, "tab recognition", otherDetector, otherExpected, "false")
      : fail(tab, "tab recognition", otherDetector, otherExpected, String(other.value))
  );

  // --- Growth signal: cheap, and the only thing the walk polls.
  const growth = await call("growth signal", "readGrowthSignal", () => page.readGrowthSignal());
  if (!growth.ok) return finish();
  const signal = growth.value || {};
  facts.count = typeof signal.count === "number" ? signal.count : 0;
  const signalExpected = "a positive scroll height, at least one card and a non-null last key";
  const signalObserved = `scrollHeight ${signal.scrollHeight}, count ${signal.count}, lastKey ${signal.lastKey}`;
  results.push(
    signal.scrollHeight > 0 && signal.count >= 1 && signal.lastKey != null
      ? pass(tab, "growth signal", "readGrowthSignal", signalExpected, signalObserved)
      : fail(tab, "growth signal", "readGrowthSignal", signalExpected, signalObserved)
  );

  // --- Scroll target: the element the walk scrolls must be nameable, so a
  // reader can tell which scroller it fell back to.
  const scroll = await call("scroll target", "scrollActivityListToBottom", () => page.scrollActivityListToBottom());
  if (!scroll.ok) return finish();
  const target = scroll.value || {};
  facts.target = { tag: target.tag || null, id: target.id || null };
  const targetExpected = "an element named by tag or id";
  results.push(
    facts.target.tag || facts.target.id
      ? pass(tab, "scroll target", "scrollActivityListToBottom", targetExpected, describeTarget(facts.target))
      : fail(tab, "scroll target", "scrollActivityListToBottom", targetExpected, "no tag and no id")
  );

  // --- Real pagination: the card count has to grow, the way the walk's own
  // scrolling expects. Scroll height alone is not proof of a new batch: it moves
  // by a few pixels on a layout shift, which is how a dead list passed this check
  // the first time it was run live. A batch that arrives only on the second
  // scroll is normal (the walk sees the same cadence), so the check scrolls up to
  // MAX_SCROLL_ATTEMPTS times before calling the pager dead.
  const before = signal;
  let after = signal;
  let attempts = 0;
  while (attempts < MAX_SCROLL_ATTEMPTS && after.count <= before.count) {
    attempts++;
    const attemptStartedAt = now();
    while (now() - attemptStartedAt < growthWaitMs && after.count <= before.count) {
      await sleep(pollIntervalMs);
      const read = await call("pagination", "readGrowthSignal", () => page.readGrowthSignal());
      if (!read.ok) return finish();
      after = read.value || {};
    }
    if (after.count > before.count) break;
    const again = await call("pagination", "scrollActivityListToBottom", () => page.scrollActivityListToBottom());
    if (!again.ok) return finish();
  }
  facts.cards = { from: before.count || 0, to: after.count || 0 };
  facts.growth = { from: before.scrollHeight || 0, to: after.scrollHeight || 0 };
  const paginationExpected = `the card count above ${facts.cards.from} after at most ${MAX_SCROLL_ATTEMPTS} scrolls of ${growthWaitMs} ms each`;
  const paginationObserved = `${describeTarget(facts.target)}, cards ${facts.cards.from} -> ${facts.cards.to}, scroll height ${facts.growth.from} -> ${facts.growth.to}`;
  results.push(
    facts.cards.to > facts.cards.from
      ? pass(tab, "pagination", "scrollActivityListToBottom", paginationExpected, paginationObserved)
      : fail(tab, "pagination", "scrollActivityListToBottom", paginationExpected, paginationObserved)
  );

  // --- Item metadata: the shape the scan envelope writes and purge --input reads.
  const read = await call("item metadata", "collectItems", () => page.collectItems([]));
  if (!read.ok) return finish();
  const items = Array.isArray(read.value) ? read.value : [];
  facts.items = items.length;

  const problems = [];
  if (!items.length) problems.push("no items at all");
  for (const [index, item] of items.entries()) {
    if (!item || item.key == null || item.key === "") problems.push(`no key on item ${index}`);
    for (const field of METADATA_FIELDS[tab]) {
      if (!item || !(field in item)) problems.push(`no ${field} on item ${index}`);
    }
  }
  const authors = items.filter((item) => item && item.author != null).length;
  const dates = items.filter((item) => item && item.dateTime != null).length;
  if (items.length && authors === 0) problems.push("no item carried an author");
  if (items.length && dates === 0) problems.push("no item carried a date");

  const metadataExpected = `every item to carry ${listFields(["key", ...METADATA_FIELDS[tab]])}, with at least one author and one date`;
  const metadataObserved = problems.length
    ? `${items.length} items; ${summarise(problems)}`
    : `${items.length} items; ${authors} authors and ${dates} dates read`;
  results.push(
    problems.length
      ? fail(tab, "item metadata", "collectItems", metadataExpected, metadataObserved)
      : pass(tab, "item metadata", "collectItems", metadataExpected, metadataObserved)
  );

  // --- Unique keys: the walk merges by key, so a repeat silently drops a card.
  const unique = new Set();
  const repeated = new Set();
  for (const item of items) {
    if (!item || item.key == null) continue;
    if (unique.has(item.key)) repeated.add(item.key);
    else unique.add(item.key);
  }
  const uniqueExpected = "one item per key";
  const uniqueObserved = repeated.size
    ? `${items.length} items, repeated keys ${[...repeated].join(", ")}`
    : `${items.length} items, ${unique.size} distinct keys`;
  results.push(
    repeated.size
      ? fail(tab, "unique keys", "collectItems", uniqueExpected, uniqueObserved)
      : pass(tab, "unique keys", "collectItems", uniqueExpected, uniqueObserved)
  );

  // --- Seen keys: hand in every key but the last; only the last (and anything
  // that loaded since) may come back. This is the incremental contract the walk
  // depends on to stay linear.
  const handed = items.slice(0, -1).map((item) => (item ? item.key : null)).filter((key) => key != null);
  const lastKey = items.length ? items[items.length - 1].key : null;
  const fresh = await call("seen keys", "collectItems", () => page.collectItems(handed));
  if (!fresh.ok) return finish();
  const freshKeys = (Array.isArray(fresh.value) ? fresh.value : [])
    .map((item) => (item ? item.key : null))
    .filter((key) => key != null);
  const handedSet = new Set(handed);
  const leaked = freshKeys.filter((key) => handedSet.has(key));
  const lastReturned = lastKey == null || freshKeys.includes(lastKey);
  const seenExpected = handed.length
    ? `only keys not handed in, so ${lastKey} and none of the ${handed.length} handed keys`
    : "the rendered items, because nothing was handed in";
  const seenObserved = [
    `handed ${handed.length} keys`,
    `got ${freshKeys.length} items`,
    leaked.length ? `leaked ${leaked.join(", ")}` : null,
    lastReturned ? null : `${lastKey} not returned`,
  ]
    .filter(Boolean)
    .join(", ");
  results.push(
    !leaked.length && lastReturned
      ? pass(tab, "seen keys", "collectItems", seenExpected, seenObserved)
      : fail(tab, "seen keys", "collectItems", seenExpected, seenObserved)
  );

  return finish();
}

// Adapt a Playwright page to the check's seam. One object, one evaluate per
// in-page helper, so the browser edge stays thin and this module never imports
// Playwright. The bound and the failure naming live in checkActivityTab().
export function createCheckPage(page) {
  return {
    isReactionsPage: () => page.evaluate(() => window.LP.isReactionsPage()),
    isCommentsPage: () => page.evaluate(() => window.LP.isCommentsPage()),
    readGrowthSignal: () => page.evaluate(() => window.LP.readGrowthSignal()),
    scrollActivityListToBottom: () => page.evaluate(() => window.LP.scrollActivityListToBottom()),
    collectItems: (seenKeys) => page.evaluate((keys) => window.LP.collectItems(keys), seenKeys),
  };
}
