/*
  Unit tests for the in-page metadata extractor (src/linkedin-dom.js).
  linkedin-dom.js is injected into the browser as a single self-contained
  script (no ES module imports), so its functions cannot be imported directly.
  Instead this test evals the source in global scope with a stubbed `window`,
  then drives the pure functions against fake DOM containers.
*/

import fs from "node:fs";
import assert from "node:assert";
import vm from "node:vm";

const src = fs.readFileSync("src/linkedin-dom.mjs", "utf8");

/*
  Indirect eval runs in global scope so the file's function declarations become
  global properties. `window` is only touched lazily inside viewerNameFromPageUrl,
  so the file loads fine in node with a stubbed empty window.
*/
globalThis.window = {};

vm.runInThisContext(src);

const {
  extractAuthorAndDate,
  viewerNameFromPageUrl,
  isPlausibleAuthorName,
  cleanText,
  extractCommentText,
  stripDegreeSuffix,
  squash,
  excerpt,
  realHref,
  isExternal,
} = globalThis;

function setViewer(pathname) {
  globalThis.window = { location: { pathname } };
}

/*
  A minimal fake DOM element. `textContent` is the visible text.
  `qs` maps a selector to a single element (querySelector), `qsa` maps a
  selector to an array of elements (querySelectorAll).
*/
function fakeEl(textContent, qs = {}, qsa = {}, attributes = {}) {
  return {
    textContent: textContent || "",
    querySelector(sel) {
      return (qs && qs[sel]) || null;
    },
    querySelectorAll(sel) {
      return (qsa && qsa[sel]) || [];
    },
    getAttribute(name) {
      return name in attributes ? attributes[name] : null;
    },
  };
}

function fakeLink(text) {
  return fakeEl(text);
}

// ---- isPlausibleAuthorName ----

function testRejectsViewer() {
  assert.strictEqual(
    isPlausibleAuthorName("Eric Derewonko", "Eric Derewonko"),
    false,
    "viewer is never the author"
  );
  assert.strictEqual(
    isPlausibleAuthorName("Zebraworks", "Eric Derewonko"),
    true,
    "a different name is plausible"
  );
  assert.strictEqual(
    isPlausibleAuthorName("Jane Doe", null),
    true,
    "no viewer: any plausible name is fine"
  );
}

function testRejectsGarbage() {
  assert.strictEqual(
    isPlausibleAuthorName("187 reactions", null),
    false,
    "reaction count rejected"
  );
  assert.strictEqual(
    isPlausibleAuthorName("24 reactions", null),
    false,
    "reaction count rejected"
  );
  assert.strictEqual(
    isPlausibleAuthorName("likes this", null),
    false,
    "UI phrase rejected"
  );
  assert.strictEqual(
    isPlausibleAuthorName("...", null),
    false,
    "ellipsis rejected"
  );
  assert.strictEqual(
    isPlausibleAuthorName("A", null),
    false,
    "single char rejected"
  );
  assert.strictEqual(isPlausibleAuthorName("", null), false, "empty rejected");
  assert.strictEqual(
    isPlausibleAuthorName("Zebraworks", null),
    true,
    "real company name accepted"
  );
  assert.strictEqual(
    isPlausibleAuthorName("John Doe", null),
    true,
    "real person name accepted"
  );
}

// ---- viewerNameFromPageUrl ----

function testViewerFromUrl() {
  setViewer("/in/eric-derewonko/recent-activity/comments/");
  assert.strictEqual(
    viewerNameFromPageUrl(),
    "eric-derewonko",
    "username extracted from path"
  );
  setViewer("/in/me/");
  assert.strictEqual(
    viewerNameFromPageUrl(),
    "me",
    "literal /in/me/ resolves to me"
  );
  setViewer("/recent-activity/comments/");
  assert.strictEqual(viewerNameFromPageUrl(), null, "no /in/ segment -> null");
  globalThis.window = undefined;
  assert.strictEqual(viewerNameFromPageUrl(), null, "no window -> null");
}

// ---- extractAuthorAndDate ----

function authorContainer(authorLinks, fallbacks = {}) {
  const qs = {
    "button[aria-label*='Open control menu for post by']":
      fallbacks.menuBtn || null,
    "time[datetime]": fallbacks.timeDatetime || null,
    time: fallbacks.time || null,
  };

  const qsa = {
    "a[href*='/in/'], a[href*='/company/']": authorLinks.map((t) =>
      fakeLink(t)
    ),
    "span, p, div, a, time, li": (fallbacks.dateEls || []).map((t) =>
      fakeEl(t)
    ),
  };

  // headline selectors
  const headlineSel = [
    ".feed-shared-update-v2__actor--headline",
    ".feed-shared-actor__sub-description",
    ".update-components-text--headline",
    "[class*='actor__headline']",
    "[class*='headline']",
  ];

  for (const sel of headlineSel) qs[sel] = fallbacks.headlineEl || null;

  return fakeEl(null, qs, qsa);
}

function testExcludesViewer() {
  setViewer("/in/eric-derewonko/recent-activity/comments/");
  const card = authorContainer(["Eric Derewonko", "Zebraworks"]);
  const meta = extractAuthorAndDate(card);
  assert.strictEqual(
    meta.author,
    "Zebraworks",
    "viewer skipped, poster chosen"
  );
}

function testOnlyViewerBecomesNull() {
  setViewer("/in/eric-derewonko/recent-activity/comments/");
  const card = authorContainer(["Eric Derewonko"]);
  const meta = extractAuthorAndDate(card);
  assert.strictEqual(
    meta.author,
    null,
    "only viewer present -> honest null, not me"
  );
}

function testRejectsReactionCountGarbage() {
  setViewer("/in/eric-derewonko/recent-activity/likes/");
  const card = authorContainer(["187 reactions", "Zebraworks"]);
  const meta = extractAuthorAndDate(card);
  assert.strictEqual(
    meta.author,
    "Zebraworks",
    "reaction-count garbage rejected"
  );
}

function testCompanyAuthor() {
  setViewer("/in/eric-derewonko/recent-activity/likes/");
  const card = authorContainer(["Eric Derewonko", "Zebraworks"]);
  const meta = extractAuthorAndDate(card);
  assert.strictEqual(meta.author, "Zebraworks", "company poster accepted");
}

function testFallbackMenuBtn() {
  setViewer("/in/eric-derewonko/recent-activity/likes/");

  // no author links, but the control-menu aria-label names the poster
  const card = authorContainer([], {
    menuBtn: fakeEl(
      "x",
      {},
      {},
      { "aria-label": "Open control menu for post by Zebraworks" }
    ),
  });

  const meta = extractAuthorAndDate(card);
  assert.strictEqual(
    meta.author,
    "Zebraworks",
    "fallback aria-label names poster"
  );
}

function testFallbackMenuBtnRejectsViewer() {
  setViewer("/in/eric-derewonko/recent-activity/likes/");

  const card = authorContainer([], {
    menuBtn: fakeEl(
      "x",
      {},
      {},
      { "aria-label": "Open control menu for post by Eric Derewonko" }
    ),
  });

  const meta = extractAuthorAndDate(card);
  assert.strictEqual(meta.author, null, "fallback names viewer -> honest null");
}

// ---- extractCommentText ----

function testCommentTextFromSelector() {
  const card = fakeEl(null, {
    ".update-components-text": fakeEl("This is my comment text"),
  });

  assert.strictEqual(
    extractCommentText(card),
    "This is my comment text",
    "comment body from selector"
  );
}

function testCommentTextFallbackLongestSpan() {
  // Author name span is short; comment body span is longer -> body wins.
  const card = fakeEl(
    null,
    {},
    {
      "span, p, div, a, time, li": [
        fakeEl("Eric Derewonko"),
        fakeEl("This is my longer comment text here"),
      ],
      "span, div, a, time, li": [
        fakeEl("Eric Derewonko"),
        fakeEl("This is my longer comment text here"),
      ],
    }
  );

  assert.strictEqual(
    extractCommentText(card),
    "This is my longer comment text here",
    "longest span wins"
  );
}

function testCommentTextRejectsShortUI() {
  const card = fakeEl(
    null,
    {},
    {
      "span[dir='ltr']": [fakeEl("liked"), fakeEl("a")],
    }
  );

  assert.strictEqual(extractCommentText(card), null, "short UI text rejected");
}

function testCommentTextNullWhenNone() {
  const card = fakeEl(null, {}, {});
  assert.strictEqual(extractCommentText(card), null, "no text -> null");
}

// ---- cleanText ----

function testCleanText() {
  assert.strictEqual(cleanText(null, 100), null, "null -> null");
  assert.strictEqual(cleanText("", 100), null, "empty -> null");
  assert.strictEqual(
    cleanText("  hello world  ", 100),
    "hello world",
    "whitespace trimmed"
  );
  assert.strictEqual(
    cleanText(
      "a very long comment that exceeds the maximum length and should be truncated with an ellipsis",
      40
    ),
    "a very long comment that exceeds the...",
    "long text truncated"
  );
}

function testStripDegreeSuffix() {
  assert.strictEqual(
    stripDegreeSuffix("Brad Bassham  • 1st"),
    "Brad Bassham",
    "strip degree suffix"
  );
  assert.strictEqual(
    stripDegreeSuffix("Yusuf. M • 3rd+"),
    "Yusuf. M",
    "strip degree suffix with plus"
  );
  assert.strictEqual(
    stripDegreeSuffix("Denis Bouchard • 2nd"),
    "Denis Bouchard",
    "strip 2nd degree"
  );
  assert.strictEqual(
    stripDegreeSuffix("The Recruiter.com Network"),
    "The Recruiter.com Network",
    "plain company name unchanged"
  );
  assert.strictEqual(
    stripDegreeSuffix("Red Hat"),
    "Red Hat",
    "plain name unchanged"
  );
}

function testRelativeDateParsing() {
  setViewer("/in/eric-derewonko/recent-activity/likes/");

  // A card whose only date-like text is a relative date "1mo"
  const card = fakeEl(
    null,
    {},
    {
      "a[href*='/in/'], a[href*='/company/']": [
        fakeLink("Brad Bassham  • 1st"),
        fakeLink("Intapp"),
      ],
      "span, p, div, a, time, li": [fakeEl("1mo")],
    }
  );

  const meta = extractAuthorAndDate(card);
  assert.strictEqual(
    meta.author,
    "Brad Bassham  • 1st",
    "author keeps degree suffix"
  );
  assert.strictEqual(meta.dateTime, "1mo", "relative date parsed");
}

function testCarveHeadlineFromAuthorLink() {
  setViewer("/in/eric-derewonko/recent-activity/likes/");

  // A text block pairs author + degree + headline + relative date
  const card = fakeEl(
    null,
    {},
    {
      "a[href*='/in/'], a[href*='/company/']": [
        fakeLink("Brad Bassham  • 1st"),
        fakeLink("Intapp"),
      ],
      "span, p, div, a, time, li": [
        fakeEl(
          "Brad Bassham  • 1stSenior Client Portfolio Manager at Intapp1mo"
        ),
        fakeEl("1mo"),
      ],
    }
  );

  const meta = extractAuthorAndDate(card);
  assert.strictEqual(
    meta.headline,
    "Senior Client Portfolio Manager at Intapp",
    "headline carved from combined text block"
  );
}

function testCommentTextFromDivNoDir() {
  // Comment text lives in a div/span without dir='ltr' (real LinkedIn DOM)
  const card = fakeEl(
    null,
    {},
    {
      "span, p, div, a, time, li": [
        fakeEl("what does it have to do with a social media job board ?"),
      ],
      "span, div, a, time, li": [
        fakeEl("what does it have to do with a social media job board ?"),
      ],
    }
  );

  assert.strictEqual(
    extractCommentText(card),
    "what does it have to do with a social media job board ?",
    "comment text from div without dir attr"
  );
}

// ---- realHref ----
function testRealHrefSafetyGo() {
  const a = fakeEl(
    "",
    {},
    {},
    {
      href: "https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fexample.com%2Fx",
      "aria-label": "",
    }
  );

  assert.strictEqual(
    realHref(a),
    "https://example.com/x",
    "safety/go unwrapped"
  );
}

function testRealHrefOpenLabel() {
  const a = fakeEl(
    "",
    {},
    {},
    { href: "#", "aria-label": "Open https://example.com/y" }
  );

  assert.strictEqual(realHref(a), "https://example.com/y", "Open label used");
}

function testRealHrefPassthrough() {
  const a = fakeEl(
    "",
    {},
    {},
    { href: "https://example.com/z", "aria-label": "" }
  );

  assert.strictEqual(realHref(a), "https://example.com/z", "passthrough");
}

// ---- isExternal ----
function testIsExternal() {
  assert.strictEqual(
    isExternal("https://www.linkedin.com/in/foo"),
    false,
    "linkedin.com not external"
  );
  assert.strictEqual(
    isExternal("https://linkedin.com/x"),
    false,
    "linkedin.com not external"
  );
  assert.strictEqual(
    isExternal("https://lnkd.in/abc"),
    true,
    "lnkd.in is external"
  );
  assert.strictEqual(
    isExternal("https://example.com/x"),
    true,
    "other host external"
  );
}

// ---- squash ----
function testSquash() {
  assert.strictEqual(squash("  a   b  "), "a b", "squash works");
  assert.strictEqual(squash(null), "", "null -> empty");
}

// ---- excerpt ----
function testExcerpt() {
  assert.strictEqual(excerpt("short"), "short", "short unchanged");
  const long = "a".repeat(300);
  assert.strictEqual(excerpt(long).length, 280, "truncated to 280");
  assert.ok(excerpt(long).endsWith("..."), "ends with ellipsis");
}

// ---- boxText ----

const tests = [
  testRejectsViewer,
  testRejectsGarbage,
  testViewerFromUrl,
  testExcludesViewer,
  testOnlyViewerBecomesNull,
  testRejectsReactionCountGarbage,
  testCompanyAuthor,
  testFallbackMenuBtn,
  testFallbackMenuBtnRejectsViewer,
  testCommentTextFromSelector,
  testCommentTextFallbackLongestSpan,
  testCommentTextRejectsShortUI,
  testCommentTextNullWhenNone,
  testCleanText,
  testStripDegreeSuffix,
  testRelativeDateParsing,
  testCarveHeadlineFromAuthorLink,
  testCommentTextFromDivNoDir,
  testRealHrefSafetyGo,
  testRealHrefOpenLabel,
  testRealHrefPassthrough,
  testIsExternal,
  testSquash,
  testExcerpt,
];

async function main() {
  let failed = 0;

  for (const fn of tests) {
    try {
      fn();
      console.log(`PASS: ${fn.name}`);
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
