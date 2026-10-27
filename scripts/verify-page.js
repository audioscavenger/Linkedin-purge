// Live page-helper check: opens both Activity tabs headless and asserts that
// `window.LP` still behaves the way scan and purge assume.
//
// This is deliberately not part of `npm run check` or `npm run health`: it opens
// LinkedIn with your own profile and needs a logged-in session (`npm run login`
// first). It reads only: it scrolls each tab once and never clicks a card.
//
// Every failure names the helper, what was expected and what was observed, and
// the process exits non-zero. The assertions themselves live in
// src/page-check.js, which is unit-tested against a fake page; this file is
// only the browser wiring.
import path from "node:path";
import { launchBrowser, injectDomHelpers } from "../src/browser.js";
import { isLoggedOut } from "../src/login-guard.js";
import { activityTargets } from "../src/activity-targets.js";
import { checkActivityTab, createCheckPage, describeTarget } from "../src/page-check.js";
import { log, warn, err } from "../src/logger.js";

// The same first-render wait scan uses before reading the page.
const FIRST_RENDER_WAIT_MS = 8000;

async function main() {
  const args = process.argv.slice(2);
  const profileDir = getFlag(args, "profile-dir", ".profile-chromium");
  const chromiumPath = getFlag(args, "chromium-path", null);

  log("Live page-helper check (not part of `npm run check`; needs a logged-in profile).");

  let context;
  try {
    context = await launchBrowser({ profileDir, headless: true, chromiumPath });
  } catch (error) {
    err(`Could not launch the browser: ${error && error.message ? error.message : error}`);
    process.exitCode = 1;
    return;
  }

  let failed = 0;
  try {
    const page = await context.newPage();
    await injectDomHelpers(page, path.resolve("./src/linkedin-dom.js"));

    // The activity URL needs the vanity name, so resolve it the way scan does.
    await page.goto("https://www.linkedin.com/in/me/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    if (isLoggedOut(page)) {
      warn("Not logged in. Run `npm run login` first.");
      process.exitCode = 1;
      return;
    }
    const match = page.url().match(/linkedin\.com\/in\/([^/]+)/);
    const username = match ? match[1] : "me";
    const baseUrl = `https://www.linkedin.com/in/${username}/recent-activity/`;

    for (const target of activityTargets("all")) {
      const tab = target.tab.replace(/\/$/, "");
      await page.goto(baseUrl + target.tab, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(FIRST_RENDER_WAIT_MS);
      if (isLoggedOut(page)) {
        warn(`${tab}: the session ended at this tab. Run \`npm run login\` and re-run.`);
        failed++;
        continue;
      }

      const result = await checkActivityTab({ tab, page: createCheckPage(page) });
      failed += report(tab, result);
    }
  } finally {
    await context.close();
  }

  if (failed > 0) {
    err(`${failed} page-helper check${failed === 1 ? "" : "s"} failed.`);
    process.exitCode = 1;
  } else {
    log("All page helpers behave as the tool assumes.");
  }
}

// One short line per passing tab; every failed assertion on its own line.
// Returns the number of failed assertions.
function report(tab, result) {
  const failures = result.results.filter((r) => !r.ok);
  if (!failures.length) {
    const { count, target, growth, cards, items } = result.facts;
    log(
      `${tab}: OK - ${count} cards, target ${describeTarget(target)}, ` +
        `cards ${cards.from} -> ${cards.to}, scroll height ${growth.from} -> ${growth.to}, ${items} items`
    );
    return 0;
  }
  for (const failure of failures) err(`${failure.tab}: ${failure.message}`);
  return failures.length;
}

function getFlag(args, name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const value = args[idx + 1];
  if (value === undefined || value.startsWith("--")) return true;
  return value;
}

main().catch((error) => {
  err(`page-helper check crashed: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
