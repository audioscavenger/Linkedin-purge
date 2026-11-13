/*
  End-to-end fixture test: run the in-page extractor against the saved
  anonymized comments page and compare to the expected output.

  The expectation is committed next to the page it describes, so the pair
  travels with the repo. When it is absent the test SKIPS loudly instead of
  passing vacuously: a fixture run that compares nothing proves nothing.
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const html = fs.readFileSync(
  path.join(root, "tests", "comments-input-test-202611.html"),
  "utf8"
);

const expectedPath = path.join(root, "tests", "comments-expected-202611.json");

if (!fs.existsSync(expectedPath)) {
  console.log(
    `SKIP: comments fixture not verified, missing ${path.relative(root, expectedPath)}`
  );
  process.exit(0);
}

const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));

if (!Array.isArray(expected) || expected.length === 0) {
  console.error(
    `FAIL: ${path.relative(root, expectedPath)} holds no expectations`
  );
  process.exit(1);
}

const dom = new JSDOM(html, {
  url: "https://www.linkedin.com/in/firstname-lastname/recent-activity/comments/",
});

const { window } = dom;

globalThis.window = window;

globalThis.document = window.document;

const src = fs.readFileSync(path.join(root, "src", "linkedin-dom.mjs"), "utf8");

window.eval(src);

const items = await window.LP.collectItems(null, false);

let failed = 0;

function check(idx, field, actual, exp) {
  if (JSON.stringify(actual) !== JSON.stringify(exp)) {
    console.error(
      `MISMATCH item ${idx} ${field}: got ${JSON.stringify(actual)} expected ${JSON.stringify(exp)}`
    );
    failed++;
  }
}

for (let i = 0; i < expected.length; i++) {
  const exp = expected[i];
  const got = items[i];

  if (!got) {
    console.error(`MISSING item ${i}`);
    failed++;
    continue;
  }

  check(i, "key", got.key, exp.key);
  check(i, "comment", got.comment, exp.comment);
  check(i, "postExcerpt", got.postExcerpt, exp.postExcerpt);
  check(i, "author", got.author, exp.author);
  check(i, "headline", got.headline, exp.headline);
  check(i, "postHref", got.postHref, exp.postHref);
  check(i, "dateTime", got.dateTime, exp.dateTime);
}

// itemHref is captured via menu (not in fixture); skip exact match but ensure present
for (let i = 0; i < items.length; i++) {
  if (items[i].itemHref === undefined) {
    console.error(`item ${i} missing itemHref field`);
    failed++;
  }
}

const passed = expected.length - failed;

console.log(
  `\n${passed}/${expected.length} items matched (${failed} mismatches)`
);

process.exit(failed > 0 ? 1 : 0);
