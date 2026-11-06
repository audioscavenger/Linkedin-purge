import assert from "node:assert";

import { generateSelectionPage } from "../src/selection-page.js";

function envelope(items, type = "likes") {
  return {
    type,
    count: items.length,
    keys: items.map((i) => i.key),
    items,
    scannedAt: "2026-10-26T07:49:00.000Z",
    steps: 1,
    complete: true,
  };
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function main() {
  const items = [
    {
      key: "reaction:1",
      cardId: "card-secret-1",
      state: "LIKE",
      author: "<b>Ada</b>",
      dateTime: "Sep 16",
      text: null,
      postExcerpt: "first excerpt",
      postHref: "/feed/update/1",
      status: "no-op",
    },
    {
      key: "reaction:2",
      cardId: "card-secret-2",
      state: "LOVE",
      author: "Bo",
      dateTime: "Sep 17",
      text: null,
      postExcerpt: "second excerpt",
      postHref: null,
      status: "todo",
    },
  ];

  const env = envelope(items);
  const html = generateSelectionPage(env);

  const match = html.match(/<script type="application\/json" id="selection-data">([\s\S]*?)<\/script>/);
  assert.ok(match, "embedded data script present");
  const parsed = JSON.parse(match[1]);
  assert.deepStrictEqual(parsed, env, "embedded data parses back to the envelope");

  assert.ok(!/src\s*=\s*["']https?:/i.test(html), "no remote script src");
  assert.ok(!/href\s*=\s*["']https?:/i.test(html), "no remote stylesheet/action href");
  assert.ok(!/<link\b/i.test(html), "no link tags");

  for (const it of items) {
    assert.ok(html.includes(esc(it.state)), "state missing: " + it.state);
    assert.ok(html.includes(esc(it.author)), "author missing: " + it.author);
    assert.ok(html.includes(esc(it.dateTime)), "date missing: " + it.dateTime);
    const text = it.text != null ? it.text : it.postExcerpt;
    assert.ok(html.includes(esc(text)), "text/excerpt missing: " + text);
    assert.ok(html.includes(esc(it.status)), "status missing: " + it.status);
  }

  assert.ok(html.includes("<th>Link</th>"), "link header present when some item has a link");
  assert.ok(html.includes("<td></td>"), "empty cell for item without a link");

  assert.ok(html.includes("&lt;b&gt;Ada&lt;/b&gt;"), "author HTML is escaped");
  assert.ok(!html.includes("<b>Ada</b>"), "raw author HTML not present");

  const noLinks = envelope([
    { key: "reaction:3", cardId: "c3", state: "LIKE", author: "C", dateTime: "Sep 18", postExcerpt: "x", postHref: null, status: "no-op" },
  ]);
  const html2 = generateSelectionPage(noLinks);
  assert.ok(!html2.includes("<th>Link<span"), "link header absent when no item has a link");

  const checkboxCount = (html.match(/<input type="checkbox"/g) || []).length
    - (html.match(/class="state-filter"/g) || []).length
    - (html.match(/id="master-select"/g) || []).length;
  assert.strictEqual(checkboxCount, items.length, "one checkbox per item, plus filter and master checkboxes");

  console.log("PASS: selection page generator");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
