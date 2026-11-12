/*
  Unit tests for the scan summary builder.

  buildScanSummary is a pure function: no browser, no page, no timers. It owns
  only the wording of the per-type progress line, so the tests pin the text
  from a result object with nothing but plain JS.
*/
import assert from "node:assert";
import { buildScanSummary } from "../src/scan-summary.mjs";

function envelope(items, overrides = {}) {
  return {
    type: "likes",
    count: items.length,
    keys: items.map((i) => i.key),
    items,
    scannedAt: "2026-10-26T07:49:00.000Z",
    steps: 1,
    complete: true,
    ...overrides,
  };
}

async function testPerTypeCountsLine() {
  const result = envelope([
    {
      key: "reaction:1",
      state: "LIKE",
      author: "A",
      postHref: null,
      dateTime: "Sep 16",
      step: 0,
    },
    {
      key: "reaction:2",
      state: "LIKE",
      author: "B",
      postHref: "/feed/update/2",
      dateTime: "Sep 17",
      step: 0,
    },
  ]);

  const text = buildScanSummary({
    type: "likes",
    result,
    pagePath: "data/selection-likes.html",
  });

  assert.ok(text.startsWith("likes:"), "prints the type prefix");
  assert.ok(
    /2 items \(2 first render\)/.test(text),
    "prints item count and first-render count"
  );
  assert.ok(/1 steps/.test(text), "prints step count");
  assert.ok(/complete/.test(text), "prints complete");
  assert.ok(/0ms/.test(text), "prints elapsed");
  assert.ok(/-> data\/selection-likes\.html/.test(text), "prints page path");
  assert.ok(
    /\(page: data\/selection-likes\.html\)/.test(text),
    "appends page path in parens"
  );
  console.log("PASS: per-type counts line with page path");
}

async function testEmptyStateWhenNoPagePath() {
  const result = envelope([
    {
      key: "reaction:1",
      state: "LIKE",
      author: "A",
      postHref: null,
      dateTime: "Sep 16",
      step: 0,
    },
  ]);

  const text = buildScanSummary({
    type: "comments",
    result,
  });

  assert.ok(text.startsWith("comments:"), "prints the type prefix");
  assert.ok(
    /1 items \(1 first render\)/.test(text),
    "prints item count and first-render count"
  );
  assert.ok(/complete/.test(text), "prints complete");
  assert.ok(!/-> /.test(text), "no page path arrow when absent");
  assert.ok(!/\(page:/.test(text), "no page parens when absent");
  console.log("PASS: empty state when no page path");
}

async function testMultipleTypes() {
  const likes = envelope([
    {
      key: "reaction:1",
      state: "LIKE",
      author: "A",
      postHref: null,
      dateTime: "Sep 16",
      step: 0,
    },
    {
      key: "reaction:2",
      state: "LIKE",
      author: "B",
      postHref: null,
      dateTime: "Sep 17",
      step: 0,
    },
  ]);

  const comments = envelope([
    {
      key: "comment:1",
      state: "COMMENT",
      author: "C",
      postHref: null,
      dateTime: "Sep 18",
      step: 0,
    },
  ]);

  const likesText = buildScanSummary({
    type: "likes",
    result: likes,
    pagePath: "data/selection-likes.html",
  });

  const commentsText = buildScanSummary({
    type: "comments",
    result: comments,
    pagePath: "data/selection-comments.html",
  });

  assert.ok(likesText.startsWith("likes:"), "likes line starts with likes");
  assert.ok(
    commentsText.startsWith("comments:"),
    "comments line starts with comments"
  );
  assert.ok(/2 items/.test(likesText), "likes line shows 2 items");
  assert.ok(/1 items/.test(commentsText), "comments line shows 1 item");
  assert.ok(
    /-> data\/selection-likes\.html/.test(likesText),
    "likes page path"
  );
  assert.ok(
    /-> data\/selection-comments\.html/.test(commentsText),
    "comments page path"
  );
  console.log("PASS: multiple types produce independent lines");
}

const tests = [
  testPerTypeCountsLine,
  testEmptyStateWhenNoPagePath,
  testMultipleTypes,
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
