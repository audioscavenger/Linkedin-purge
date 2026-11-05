// Tests for cardId on collected items and live page check assertion.
import assert from "node:assert";
import { checkActivityTab } from "../src/page-check.js";

function itemsFor(tab) {
  if (tab === "comments") {
    return [
      { key: "replaceableComment_1", cardId: "urn:li:activity:12345", author: "Ada", postHref: "/feed/update/1", dateTime: "Sep 16" },
      { key: "replaceableComment_2", cardId: "urn:li:activity:67890", author: "Bo", postHref: null, dateTime: "Sep 17" },
    ];
  }
  return [
    { key: "reaction:0", cardId: "urn:li:activity:11111", state: "LIKE", author: "Ada", postHref: "/feed/update/1", dateTime: "Sep 16" },
    { key: "reaction:1", cardId: "urn:li:activity:22222", state: "LOVE", author: "Bo", postHref: null, dateTime: "Sep 17" },
  ];
}

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

function failureText(result) {
  return failures(result).map((r) => r.message).join(" | ") || "(no failures)";
}

async function testCardIdPresentAndValid() {
  for (const tab of ["reactions", "comments"]) {
    const result = await check(fakePage({ tab }), { tab });
    assert(result.ok, `${tab}: expected check to pass with valid cardId; ${failureText(result)}`);
  }
  console.log("PASS: cardId present and valid on both tabs");
}

async function testMissingCardIdFailsCheck() {
  for (const tab of ["reactions", "comments"]) {
    const badItems = itemsFor(tab).map((it, idx) => idx === 0 ? { ...it, cardId: null } : it);
    const result = await check(fakePage({ tab, items: badItems }), { tab });
    const metaFailure = failures(result).find((r) => r.step === "item metadata");
    assert(metaFailure, `${tab}: expected item metadata failure when cardId is missing`);
    assert(metaFailure.observed.includes("no cardId on item 0"), `${tab}: expected failure message to name missing cardId on item 0, got ${metaFailure.observed}`);
  }
  console.log("PASS: missing cardId fails live page check item metadata step");
}

async function main() {
  await testCardIdPresentAndValid();
  await testMissingCardIdFailsCheck();
  console.log("\nAll cardId tests passed!");
}

main();
