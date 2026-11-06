/*
  Unit tests for the Activity Session: base URL derivation, both login guards,
  the CDP attach path, the settle waits and close semantics.

  Every dependency is injected (launch, attach, inject, wait) with a scripted
  fake, so no browser opens and nothing sleeps. The command-level tests still
  reach the module-level launch stub in browser.js through the default launch.
*/
import assert from "node:assert";
import {
  ActivitySession,
  SessionExpiredError,
  PROFILE_SETTLE_MS,
  TARGET_SETTLE_MS,
} from "../src/activity-session.js";

const PROFILE_URL = "https://www.linkedin.com/in/me/";
const PROFILE_PAGE = "https://www.linkedin.com/in/ada/";
const BASE_URL = "https://www.linkedin.com/in/ada/recent-activity/";

// A page whose goto applies the redirect, records the URL it was sent to, and
// answers url() with whatever the redirect produced.
function fakePage({ redirect = (url) => url } = {}) {
  const page = {
    gotos: [],
    currentUrl: null,
    async goto(url) {
      page.gotos.push(url);
      page.currentUrl = redirect(url);
    },
    url() {
      return page.currentUrl;
    },
  };
  return page;
}

function fakeContext(page) {
  const context = {
    closed: 0,
    async newPage() {
      return page;
    },
    async close() {
      context.closed++;
    },
  };
  return context;
}

function fakeBrowser() {
  const browser = {
    closed: 0,
    async close() {
      browser.closed++;
    },
  };
  return browser;
}

// Open a session over a fake launch, returning the session and what it waited.
async function openOver(launch, options = {}) {
  const waits = [];
  const injected = [];
  const session = await ActivitySession.open({
    profileDir: "profile",
    headless: true,
    launch,
    inject: async (page, helperPath) => {
      injected.push({ page, helperPath });
    },
    wait: async (ms) => {
      waits.push(ms);
    },
    ...options,
  });
  return { session, waits, injected };
}

async function testDerivesBaseUrlAndSettles() {
  const page = fakePage({
    redirect: (url) => (url === PROFILE_URL ? PROFILE_PAGE : url),
  });
  const context = fakeContext(page);
  let launchOpts = null;
  const { session, waits, injected } = await openOver(async (opts) => {
    launchOpts = opts;
    return context;
  });

  assert.strictEqual(
    launchOpts.profileDir,
    "profile",
    "profile dir reaches the launch"
  );
  assert.strictEqual(
    launchOpts.headless,
    true,
    "browser mode reaches the launch"
  );
  assert.strictEqual(
    page.gotos[0],
    PROFILE_URL,
    "the profile visit comes first"
  );
  assert.strictEqual(
    injected.length,
    1,
    "the in-page helpers are injected once"
  );
  assert.deepStrictEqual(
    waits,
    [PROFILE_SETTLE_MS],
    "the profile page settles before the guard"
  );
  assert.strictEqual(
    session.baseUrl,
    BASE_URL,
    "base URL comes from the profile slug"
  );
  console.log("PASS: base URL derived, helpers injected, profile settle");
}

async function testBaseUrlFallsBackToMe() {
  const page = fakePage({ redirect: () => "https://www.linkedin.com/in/" });
  const context = fakeContext(page);
  const { session } = await openOver(async () => context);

  assert.strictEqual(
    session.baseUrl,
    "https://www.linkedin.com/in/me/recent-activity/",
    "a URL with no slug falls back to me"
  );
  console.log("PASS: base URL fallback");
}

async function testOpenTargetParksOnTab() {
  const page = fakePage({
    redirect: (url) => (url === PROFILE_URL ? PROFILE_PAGE : url),
  });
  const context = fakeContext(page);
  const { session, waits } = await openOver(async () => context);

  const parked = await session.openTarget({
    type: "comments",
    tab: "comments/",
  });

  assert.strictEqual(parked, page, "openTarget returns the page");
  assert.strictEqual(
    page.gotos[1],
    BASE_URL + "comments/",
    "the tab navigation uses the derived base URL"
  );
  assert.deepStrictEqual(
    waits,
    [PROFILE_SETTLE_MS, TARGET_SETTLE_MS],
    "the tab settles before the second guard"
  );
  console.log("PASS: openTarget parks on the tab");
}

async function testProfileGuardThrowsAndCloses() {
  const page = fakePage({ redirect: () => "https://www.linkedin.com/login" });
  const context = fakeContext(page);

  await assert.rejects(
    openOver(async () => context),
    (error) => {
      assert.ok(
        error instanceof SessionExpiredError,
        "throws SessionExpiredError"
      );
      assert.strictEqual(
        error.friendly,
        true,
        "the CLI prints the message without a stack"
      );
      assert.ok(
        error.message.includes("npm run login"),
        "the message names the fix"
      );
      return true;
    }
  );
  assert.strictEqual(
    context.closed,
    1,
    "what open opened is closed before the throw"
  );
  console.log("PASS: profile guard throws and closes");
}

async function testTabGuardThrows() {
  const page = fakePage({
    redirect: (url) =>
      url === PROFILE_URL
        ? PROFILE_PAGE
        : "https://www.linkedin.com/checkpoint",
  });
  const context = fakeContext(page);
  const { session } = await openOver(async () => context);

  await assert.rejects(
    session.openTarget({ type: "likes", tab: "reactions/" }),
    SessionExpiredError,
    "a lapsed tab throws the same error"
  );
  await session.close();
  assert.strictEqual(context.closed, 1, "close still works after a lapsed tab");
  console.log("PASS: tab guard throws");
}

async function testCdpPathClosesBrowser() {
  const page = fakePage({
    redirect: (url) => (url === PROFILE_URL ? PROFILE_PAGE : url),
  });
  const context = fakeContext(page);
  const browser = fakeBrowser();
  let launchCalled = false;
  let attachedTo = null;

  const session = await ActivitySession.open({
    profileDir: "profile",
    cdp: "http://localhost:9222",
    launch: async () => {
      launchCalled = true;
      return context;
    },
    attach: async (endpoint) => {
      attachedTo = endpoint;
      return { browser, context };
    },
    inject: async () => {},
    wait: async () => {},
  });

  assert.strictEqual(
    launchCalled,
    false,
    "a CDP endpoint attaches instead of launching"
  );
  assert.strictEqual(
    attachedTo,
    "http://localhost:9222",
    "the endpoint reaches the attach seam"
  );

  await session.close();
  assert.strictEqual(browser.closed, 1, "close closes the attached browser");
  assert.strictEqual(
    context.closed,
    0,
    "the attached context is owned by the browser"
  );
  console.log("PASS: CDP attach and close");
}

async function testCloseIsIdempotent() {
  const page = fakePage({
    redirect: (url) => (url === PROFILE_URL ? PROFILE_PAGE : url),
  });
  const context = fakeContext(page);
  const { session } = await openOver(async () => context);

  await session.close();
  await session.close();

  assert.strictEqual(context.closed, 1, "a second close is a no-op");
  console.log("PASS: close is idempotent");
}

const tests = [
  testDerivesBaseUrlAndSettles,
  testBaseUrlFallsBackToMe,
  testOpenTargetParksOnTab,
  testProfileGuardThrowsAndCloses,
  testTabGuardThrows,
  testCdpPathClosesBrowser,
  testCloseIsIdempotent,
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
