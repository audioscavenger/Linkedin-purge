// Unit tests for the live page-helper check.
// No browser, no DOM: the checks run against a fake page seam that scripts the
// in-page helpers' answers (a growth signal, one scroll, item pages), the same
// way the Activity Loader tests script their fake page. The only real waiting is
// the 25 ms call bound in the hung-call test; every other wait runs on a fake
// clock, so the suite stays fast and deterministic.
import { checkActivityTab } from "../src/page-check.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Reactions and comments differ in one field: reactions carry their per-item
// state, comments have none (the delete flow stamps COMMENTS_STATE into reports).
function itemsFor(tab) {
  if (tab === "comments") {
    return [
      { key: "replaceableComment_1", author: "Ada", postHref: "/feed/update/1", dateTime: "Sep 16" },
      { key: "replaceableComment_2", author: "Bo", postHref: null, dateTime: "Sep 17" },
    ];
  }
  return [
    { key: "reaction:0", state: "LIKE", author: "Ada", postHref: "/feed/update/1", dateTime: "Sep 16" },
    { key: "reaction:1", state: "LOVE", author: "Bo", postHref: null, dateTime: "Sep 17" },
  ];
}

// One scripted Activity Page seam. The scroll flips the growth signal from
// `scrollHeight` to `grownHeight`, which is what real pagination looks like;
// collectItems honours the incremental contract unless ignoreSeen is set.
function fakePage(options = {}) {
  const tab = options.tab || "reactions";
  const items = options.items || itemsFor(tab);
  const scrollHeight = options.scrollHeight ?? 1000;
  const grownHeight = options.grownHeight ?? 1500;
  const grows = options.grows ?? grownHeight > scrollHeight;
  let scrolled = false;

  const page = {
    isReactionsPage: () => tab === "reactions",
    isCommentsPage: () => tab === "comments",
    readGrowthSignal: () => ({
      scrollHeight: scrolled ? grownHeight : scrollHeight,
      count: scrolled && grows ? items.length + 10 : items.length,
      lastKey: items.length ? items[items.length - 1].key : null,
    }),
    scrollActivityListToBottom: () => {
      scrolled = true;
      return options.target || { tag: "MAIN", id: "workspace" };
    },
    collectItems: (seenKeys = []) => {
      const seen = new Set(options.ignoreSeen ? [] : seenKeys);
      return items.filter((item) => !seen.has(item.key)).map((item) => ({ ...item }));
    },
  };
  return { ...page, ...(options.overrides || {}) };
}

// The loader tests' controllable clock: the real poll interval and growth
// deadline are exercised, but no wall clock time is spent.
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    elapsed: () => t,
  };
}

async function check(page, options = {}) {
  const clock = fakeClock();
  return checkActivityTab({
    tab: options.tab || "reactions",
    page,
    now: clock.now,
    sleep: clock.sleep,
    ...options,
  });
}

function failures(result) {
  return result.results.filter((r) => !r.ok);
}

function failureFor(result, helper) {
  return failures(result).find((r) => r.helper === helper);
}

function failureText(result) {
  return failures(result).map((r) => r.message).join(" | ") || "(no failures)";
}

// Both tabs pass: the opened tab is recognised, the other is not, the growth
// signal has a shape, the scroll names its element and the list grows, the items
// carry their metadata with unique keys, and the seen-key contract holds.
async function testBothTabsPass() {
  for (const tab of ["reactions", "comments"]) {
    const result = await check(fakePage({ tab }), { tab });

    assert(result.ok, `${tab}: expected every check to pass; ${failureText(result)}`);
    assert(result.facts.count === 2, `${tab}: expected 2 cards in the growth signal, got ${result.facts.count}`);
    assert(result.facts.target.id === "workspace", `${tab}: expected the target to be named, got ${JSON.stringify(result.facts.target)}`);
    assert(result.facts.growth.from === 1000 && result.facts.growth.to === 1500, `${tab}: bad growth facts ${JSON.stringify(result.facts.growth)}`);
    assert(result.facts.items === 2, `${tab}: expected 2 collected items, got ${result.facts.items}`);
    assert(
      result.results.length === 8,
      `${tab}: expected 8 named checks (recognition x2, growth, target, pagination, metadata, unique keys, seen keys), got ${result.results.length}`
    );
  }

  console.log("PASS: both tabs pass every check through the fake page seam");
}

// A tab opened on the wrong detector fails on the detector for that tab, and a
// detector that stays true on the other tab fails too: the check names which.
async function testBadTabDetection() {
  const openedWrong = await check(fakePage({ overrides: { isReactionsPage: () => false } }));
  const openedFailure = failureFor(openedWrong, "isReactionsPage");
  assert(openedFailure, `Expected an isReactionsPage failure; ${failureText(openedWrong)}`);
  assert(openedFailure.step === "tab recognition", `Expected the tab recognition step, got ${openedFailure.step}`);
  assert(
    openedFailure.expected === "true on the reactions tab" && openedFailure.observed === "false",
    `Bad tab-recognition failure: ${openedFailure.message}`
  );
  assert(openedWrong.ok === false, "A failed tab detector must fail the tab");

  const otherTrue = await check(fakePage({ overrides: { isCommentsPage: () => true } }));
  const otherFailure = failureFor(otherTrue, "isCommentsPage");
  assert(otherFailure, `Expected an isCommentsPage failure; ${failureText(otherTrue)}`);
  assert(
    otherFailure.expected === "false on the reactions tab" && otherFailure.observed === "true",
    `Bad other-tab failure: ${otherFailure.message}`
  );

  console.log("PASS: tab recognition failures name the detector, the expectation and what it returned");
}

// A growth signal that never moves is the "scan of 0 items" failure mode: the
// check names readGrowthSignal and reports all three fields it saw.
async function testDeadGrowthSignal() {
  const dead = { scrollHeight: 0, count: 0, lastKey: null };
  const result = await check(fakePage({ overrides: { readGrowthSignal: () => dead }, grownHeight: 0 }));
  const failure = failureFor(result, "readGrowthSignal");

  assert(failure, `Expected a readGrowthSignal failure; ${failureText(result)}`);
  assert(failure.step === "growth signal", `Expected the growth signal step, got ${failure.step}`);
  assert(
    failure.expected === "a positive scroll height, at least one card and a non-null last key",
    `Bad growth expectation: ${failure.expected}`
  );
  for (const seen of ["scrollHeight 0", "count 0", "lastKey null"]) {
    assert(failure.observed.includes(seen), `The growth failure must report ${seen}: ${failure.observed}`);
  }

  console.log("PASS: a dead growth signal fails with readGrowthSignal and the three observed fields");
}

// The scroll target can be named while the list never grows: that is a wrong
// scroll target or a markup change in the list, and it names both counts.
async function testNoPagination() {
  const result = await check(fakePage({ grownHeight: 1000 }));
  const failure = failureFor(result, "scrollActivityListToBottom");

  assert(failure, `Expected a scrollActivityListToBottom failure; ${failureText(result)}`);
  assert(failure.step === "pagination", `Expected the pagination step, got ${failure.step}`);
  assert(
    failure.expected === "the card count above 2 after at most 3 scrolls of 3000 ms each",
    `Bad pagination expectation: ${failure.expected}`
  );
  for (const seen of ["MAIN#workspace", "cards 2 -> 2", "scroll height 1000 -> 1000"]) {
    assert(failure.observed.includes(seen), `The pagination failure must report ${seen}: ${failure.observed}`);
  }

  console.log("PASS: no growth after one scroll fails with the target and the counts before and after");
}

// A batch that only arrives on the second scroll is the normal cadence on the
// live page, so the check must scroll again instead of calling the pager dead.
async function testPaginationOnSecondScroll() {
  let scrolls = 0;
  const base = fakePage({ grownHeight: 1000, grows: false });
  const page = {
    ...base,
    scrollActivityListToBottom: () => {
      scrolls++;
      return { tag: "MAIN", id: "workspace" };
    },
    readGrowthSignal: () => ({
      scrollHeight: 1000 + scrolls * 500,
      count: scrolls >= 2 ? 12 : 2,
      lastKey: "reaction:1",
    }),
  };

  const result = await check(page);

  assert(result.ok, `Expected a pass once the second scroll loaded a batch; ${failureText(result)}`);
  assert(result.facts.cards.from === 2 && result.facts.cards.to === 12, `Bad card facts ${JSON.stringify(result.facts.cards)}`);

  console.log("PASS: pagination passes when the batch only arrives on a later scroll");
}

// Items that lose a promised metadata field fail with the field and the item;
// the check reads reactions' state field and does not demand it from comments.
async function testMissingMetadata() {
  const items = [
    { key: "reaction:0", author: "Ada", postHref: "/feed/update/1", dateTime: "Sep 16" }, // no state
    { key: "reaction:1", state: "LOVE", postHref: null, dateTime: "Sep 17" }, // no author
  ];
  const result = await check(fakePage({ items }));
  const failure = failureFor(result, "collectItems");

  assert(failure, `Expected a collectItems failure; ${failureText(result)}`);
  assert(failure.step === "item metadata", `Expected the item metadata step, got ${failure.step}`);
  assert(failure.expected.includes("state, author, postHref and dateTime"), `Bad metadata expectation: ${failure.expected}`);
  assert(failure.observed.includes("no state on item 0"), `Missing state not named: ${failure.observed}`);
  assert(failure.observed.includes("no author on item 1"), `Missing author not named: ${failure.observed}`);

  // Comments carry no state, so the same shape without state passes on that tab.
  const commentItems = [{ key: "replaceableComment_1", author: "Ada", postHref: null, dateTime: "Sep 16" }];
  const comments = await check(fakePage({ tab: "comments", items: commentItems }), { tab: "comments" });
  assert(comments.ok, `Comments must not be asked for a state field; ${failureText(comments)}`);

  console.log("PASS: missing metadata fields are named per field and per item");
}

// Duplicate keys would make the walk drop a card silently (the merge is keyed).
async function testDuplicateKeys() {
  const items = [
    { key: "reaction:0", state: "LIKE", author: "Ada", postHref: null, dateTime: "Sep 16" },
    { key: "reaction:0", state: "LOVE", author: "Bo", postHref: null, dateTime: "Sep 17" },
    { key: "reaction:1", state: "LIKE", author: "Cy", postHref: null, dateTime: "Sep 18" },
  ];
  const result = await check(fakePage({ items }));
  const uniqueFailure = failures(result).find((r) => r.step === "unique keys");

  assert(uniqueFailure, `Expected a unique-keys failure; ${failureText(result)}`);
  assert(uniqueFailure.helper === "collectItems", `Expected collectItems as the helper, got ${uniqueFailure.helper}`);
  assert(uniqueFailure.observed.includes("reaction:0"), `The repeated key is not named: ${uniqueFailure.observed}`);

  console.log("PASS: duplicate keys fail the check and the repeated key is named");
}

// The incremental contract: collectItems(seenKeys) must return only keys that
// were not handed in, or a deep walk re-reads every card (and purge's
// first-eligible lookup sees items it already processed).
async function testLeakedSeenKeys() {
  const result = await check(fakePage({ ignoreSeen: true }));
  const failure = failures(result).find((r) => r.step === "seen keys");

  assert(failure, `Expected a seen-keys failure; ${failureText(result)}`);
  assert(failure.helper === "collectItems", `Expected collectItems as the helper, got ${failure.helper}`);
  assert(failure.observed.includes("leaked reaction:0"), `The leaked key is not named: ${failure.observed}`);
  assert(failure.expected.includes("reaction:1"), `The one unseen key is not named in the expectation: ${failure.expected}`);

  console.log("PASS: a collector that ignores the handed-in keys fails the seen-key contract");
}

// A hung in-page call is the failure that stalled the comments walk: it must
// fail with the helper's name and the step, not hang the command. The only real
// wait here is the 25 ms bound.
async function testHungCallIsNamed() {
  const startedAt = Date.now();
  const result = await check(
    fakePage({ overrides: { readGrowthSignal: () => new Promise(() => {}) } }),
    { callTimeoutMs: 25 }
  );
  const elapsed = Date.now() - startedAt;
  const failure = failureFor(result, "readGrowthSignal");

  assert(failure, `Expected a readGrowthSignal failure; ${failureText(result)}`);
  assert(failure.step === "growth signal", `Expected the step that hung, got ${failure.step}`);
  assert(failure.observed.includes("no result after 25 ms"), `The timeout is not named: ${failure.observed}`);
  assert(elapsed < 2000, `The check must return when the call is bound, took ${elapsed} ms`);
  assert(result.ok === false, "A hung call must fail the tab");

  console.log("PASS: a hung call fails with the helper name and the step instead of hanging");
}

// A call that throws (window.LP missing after a markup change, a navigation
// away) is reported against the helper rather than escaping as a stack trace.
async function testThrowingCallIsNamed() {
  const result = await check(
    fakePage({ overrides: { scrollActivityListToBottom: () => { throw new Error("window.LP is not defined"); } } })
  );
  const failure = failureFor(result, "scrollActivityListToBottom");

  assert(failure, `Expected a scrollActivityListToBottom failure; ${failureText(result)}`);
  assert(failure.step === "scroll target", `Expected the scroll target step, got ${failure.step}`);
  assert(failure.observed.includes("window.LP is not defined"), `The thrown message is lost: ${failure.observed}`);

  console.log("PASS: a throwing call is reported against its helper");
}

// The failure message itself carries the helper, the expectation and the
// observation, so a reader can tell a markup change from a network hiccup.
async function testFailureMessageCarriesBothValues() {
  const result = await check(fakePage({ grownHeight: 1000 }));
  const failure = failureFor(result, "scrollActivityListToBottom");

  assert(failure, `Expected a pagination failure; ${failureText(result)}`);
  assert(failure.message.startsWith("scrollActivityListToBottom [pagination]: expected "), `Bad message lead: ${failure.message}`);
  assert(failure.message.includes(failure.expected), `The message omits the expectation: ${failure.message}`);
  assert(failure.message.includes(failure.observed), `The message omits the observation: ${failure.message}`);
  assert(
    failure.expected.includes("2") && failure.observed.includes("1000"),
    `Both values must be present: ${failure.message}`
  );

  console.log("PASS: a failure message names the helper, the expectation and the observation");
}

const tests = [
  testBothTabsPass,
  testBadTabDetection,
  testDeadGrowthSignal,
  testNoPagination,
  testPaginationOnSecondScroll,
  testMissingMetadata,
  testDuplicateKeys,
  testLeakedSeenKeys,
  testHungCallIsNamed,
  testThrowingCallIsNamed,
  testFailureMessageCarriesBothValues,
];

async function main() {
  let failed = 0;
  for (const fn of tests) {
    try {
      await fn();
    } catch (e) {
      console.error(`FAIL: ${fn.name} - ${e.message}`);
      failed++;
    }
  }
  const passed = tests.length - failed;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
