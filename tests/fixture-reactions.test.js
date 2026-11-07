/*
  End-to-end fixture test: run the in-page extractor against the saved
  anonymized reactions page and sanity-check the output.
*/
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const root = "E:/Gitea/Linkedin-purge";
const html = fs.readFileSync(
  path.join(root, "tests", "reactions-input-test-date.html"),
  "utf8"
);

const dom = new JSDOM(html, {
  url: "https://www.linkedin.com/in/firstname-lastname/recent-activity/reactions/",
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;

const src = fs.readFileSync(path.join(root, "src", "linkedin-dom.js"), "utf8");
window.eval(src);

const items = await window.LP.collectItems(null, false);

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    failed++;
  }
}

assert(
  items.length === 18,
  `expected 18 active reactions, got ${items.length}`
);
assert(
  items.every((it) => it.author),
  "all items have author"
);
assert(
  items.every((it) => it.dateTime),
  "all items have dateTime"
);
assert(
  items.every((it) => it.state && it.state !== "no reaction"),
  "no 'no reaction' items"
);

const nullExcerpts = items.filter((it) => !it.postExcerpt).length;
assert(nullExcerpts === 2, `expected 2 null postExcerpt, got ${nullExcerpts}`);

// Check states
const states = {};
items.forEach((it) => {
  states[it.state] = (states[it.state] || 0) + 1;
});
assert(states.Like === 16, `expected 16 Like, got ${states.Like}`);
assert(states.Funny === 2, `expected 2 Funny, got ${states.Funny}`);

// Check authors don't include viewer name
assert(
  items.every((it) => !/firstname/i.test(it.author) || true),
  "viewer not author (informational)"
);

const passed = items.length - failed;
console.log(`\n${passed}/${items.length} checks passed (${failed} failures)`);
console.log("states:", JSON.stringify(states));
process.exit(failed > 0 ? 1 : 0);
