// Tests for comment text and post excerpt extraction.
import assert from "node:assert";
import { checkActivityTab } from "../src/page-check.mjs";

function itemsFor(tab) {
  if (tab === "comments") {
    return [
      {
        key: "replaceableComment_1",
        cardId: "urn:li:activity:1",
        text: "This is a comment body",
        postExcerpt: "This is a post excerpt",
        author: "Ada",
        postHref: "/feed/update/1",
        itemHref: "/item/1",
        dateTime: "Sep 16",
      },
    ];
  }
  return [
    {
      key: "reaction:0",
      cardId: "urn:li:activity:2",
      text: null,
      postExcerpt: "Liked post excerpt",
      state: "LIKE",
      author: "Bo",
      postHref: "/feed/update/2",
      itemHref: "/item/2",
      dateTime: "Sep 17",
    },
  ];
}

function fakePage(options = {}) {
  const tab = options.tab || "reactions";
  const items = options.items || itemsFor(tab);
  let scrolled = false;
  return {
    isReactionsPage: () => tab === "reactions",
    isCommentsPage: () => tab === "comments",
    readGrowthSignal: () => ({
      scrollHeight: scrolled ? 1500 : 1000,
      count: scrolled ? items.length + 10 : items.length,
      lastKey: items[items.length - 1].key,
    }),
    scrollActivityListToBottom: () => {
      scrolled = true;
      return { tag: "MAIN", id: "workspace" };
    },
    collectItems: () => items.map((it) => ({ ...it })),
  };
}

async function main() {
  for (const tab of ["reactions", "comments"]) {
    const res = await checkActivityTab({
      tab,
      page: fakePage({ tab }),
      now: () => 0,
      sleep: async () => {},
    });
    assert(
      res.ok,
      `${tab} check failed: ${res.results
        .filter((r) => !r.ok)
        .map((r) => r.message)
        .join(", ")}`
    );
  }
  console.log("PASS: text and postExcerpt verified successfully across tabs");
}

main();
