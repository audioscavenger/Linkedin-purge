// Unit tests for the login guard: one three-way URL test shared by scan and
// purge, so neither command can drift into its own idea of a dead session.
// No browser: the guard only reads the current URL through the page seam.
import { isLoggedOut } from "../src/login-guard.js";

function pageAt(url) {
  return { url: () => url };
}

// A login, checkpoint or authwall redirect means the session ended and nothing
// on the page is what the run thinks it is.
async function testRedirectsAreLoggedOut() {
  const urls = [
    "https://www.linkedin.com/login",
    "https://www.linkedin.com/uas/login?session_redirect=%2Ffeed%2F",
    "https://www.linkedin.com/checkpoint/challenge/123",
    "https://www.linkedin.com/authwall?trk=gf",
  ];
  for (const url of urls) {
    if (!isLoggedOut(pageAt(url))) throw new Error(`Expected ${url} to count as logged out`);
  }
  console.log("PASS: login, checkpoint and authwall URLs are logged out");
}

// A real Activity List page, the profile page and the feed are live sessions.
async function testRealPagesAreLoggedIn() {
  const urls = [
    "https://www.linkedin.com/in/eric-derewonko-123/recent-activity/reactions/",
    "https://www.linkedin.com/in/eric-derewonko-123/recent-activity/comments/",
    "https://www.linkedin.com/in/me/",
    "https://www.linkedin.com/feed/",
  ];
  for (const url of urls) {
    if (isLoggedOut(pageAt(url))) throw new Error(`Expected ${url} to count as still logged in`);
  }
  console.log("PASS: activity, profile and feed pages are logged in");
}

// The guard reads the URL at call time, not once at construction: a session can
// expire between two tabs of the same run.
async function testReadsUrlAtCallTime() {
  let url = "https://www.linkedin.com/feed/";
  const page = { url: () => url };
  if (isLoggedOut(page)) throw new Error("Expected the first URL to be logged in");
  url = "https://www.linkedin.com/authwall?trk=gf";
  if (!isLoggedOut(page)) throw new Error("Expected the guard to re-read the URL");
  console.log("PASS: the guard reads the URL at call time");
}

const tests = [testRedirectsAreLoggedOut, testRealPagesAreLoggedIn, testReadsUrlAtCallTime];

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
