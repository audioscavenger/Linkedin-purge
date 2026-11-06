/*
  =============================================================================
  DOM probe for the LinkedIn Activity List.
  =============================================================================

  PURPOSE
  -------
  Launches headed with your logged-in Chromium profile (the same one used by
  scan/purge via config.json), opens the comments and/or reactions Activity
  List tabs (first page only - NO scroll), and dumps per-card DOM structure
  so exact author/headline/date/text selectors can be written for
  src/linkedin-dom.js without guessing.

  It is intentionally read-only: it never clicks a card, never deletes
  anything, and never scrolls. It only reads the DOM that is already on the
  first page.

  LAST VERIFIED WORKING
  ---------------------
  Fri Nov 06 2026 - against the live LinkedIn Activity List with a logged-in
  Chromium profile at E:/wintools/PortableApps/chromium-win64/profile.

  LinkedIn changes its obfuscated class names and markup to combat scrapers,
  so the selectors this probe discovers will rot over time. When scan
  metadata breaks again, re-run this probe against the live DOM and update
  src/linkedin-dom.js accordingly. Do not trust selectors captured before
  this date without re-verifying.

  HOW TO INVOKE
  -------------
  One script serves BOTH tabs. Pass the Activity type as the first argument:

    node scripts/probe-dom.js                    # comments tab (default)
    node scripts/probe-dom.js likes              # reactions tab
    node scripts/probe-dom.js comments           # comments tab (explicit)
    node scripts/probe-dom.js --headless         # run without a visible window

  `--headless` is optional; by default the browser opens headed so you can
  watch what it does. config.json paths (profileDir, chromiumPath) are honored
  if present; defaults are .profile-chromium and auto-detected Chromium.

  REQUIREMENTS
  ------------
  - A logged-in Chromium profile (run `npm run login` first if the session
    has expired).
  - Node.js with the project dependencies installed (playwright).

  QUIRKS ENCOUNTERED SO FAR (as of Fri Nov 06 2026)
  -------------------------------------------------
  1. The first /in/ link on BOTH tabs is always the viewer ("me"), never the
     poster. Author must be taken from a non-viewer /in/ or /company/ link,
     or from the control-menu aria-label "Open control menu for post by X".
  2. Poster links carry the name plus a connection-degree suffix, e.g.
     "Brad Bassham  • 1st", "Yusuf. M • 3rd+". Strip the suffix.
  3. LinkedIn class names are obfuscated and change per deploy (fa4l40,
     gvyl4n, etc.). Do not hardcode them; find structural selectors instead.
  4. Comment text spans do NOT carry dir='ltr'. The comment body is found by
     scanning all text-bearing elements and picking the longest meaningful
     one that is not UI chrome ("Feed post", "New comment in your group",
     "Load more comments", impression counts, viewer badge).
  5. Dates are relative ("1mo", "1w", "3d"), not calendar dates, and appear in
     text blocks, not <time datetime>.
  6. The viewer's own profile badge leaks into the first /in/ link text
     ("Eric Derewonko Verified Profile You ... Implementation Consultant @
     nQ Zebraworks | Automating Business Processes"). Never use link
     .textContent verbatim for comments; extract the poster name only.
  7. Card containers (div[role="listitem"]) have no id (cardId is null) in
     the current DOM - Card Identity is read from the card element's id
     attribute when present, otherwise unknown at probe time.

  OUTPUT
  ------
  For each of the first 4 cards on the tab it prints:
    cardId, menuAria (who the post is by), LINKS (href + fullText + nameSpan
    + classes), TIMES, TEXT_CANDIDATES, HEADLINE_CANDIDATES, TEXT_BLOCKS, and
    a trimmed OUTERHTML. Review these blocks to write exact selectors.
*/
import path from "node:path";
import fs from "node:fs";
import { launchBrowser, injectDomHelpers } from "../src/browser.js";
import { isLoggedOut } from "../src/login-guard.js";
import { activityTargets } from "../src/activity-targets.js";
import { log, err } from "../src/logger.js";

const FIRST_RENDER_WAIT_MS = 8000;
const MAX_CARDS = 4;

function trimHtml(html, maxLen = 2200) {
  if (!html) return "";
  const collapsed = html.replace(/\s+/g, " ").trim();
  return collapsed.length > maxLen
    ? collapsed.slice(0, maxLen) + " …[trimmed]"
    : collapsed;
}

// The inspector runs inside the page and returns everything needed to write
// selectors for author/headline/date/text.
function inspectCardScript(idx) {
  return `
    (function(){
      const cards = document.querySelectorAll('div[role="listitem"]');
      const card = cards[${idx}];
      if (!card) return null;
      const out = { cardId: card.id || null };
      out.links = [];
      for (const a of card.querySelectorAll("a[href*='/in/'], a[href*='/company/']")) {
        const span = a.querySelector("span[dir='ltr']");
        out.links.push({
          href: a.getAttribute("href"),
          text: (a.textContent || "").trim(),
          nameSpan: span ? (span.textContent || "").trim() : null,
          classes: a.className || "",
        });
      }
      out.times = [];
      for (const t of card.querySelectorAll("time")) {
        out.times.push({ datetime: t.getAttribute("datetime"), text: (t.textContent || "").trim() });
      }
      const menuBtn = card.querySelector("button[aria-label*='Open control menu']");
      out.menuAria = menuBtn ? menuBtn.getAttribute("aria-label") : null;
      out.textCandidates = [];
      for (const sel of [".update-components-text", ".comment-item__text",
                         ".feed-shared-update-v2__description",
                         "[class*='comment-text']", "[class*='comment-body']",
                         "[class*='comment-content']", ".break-words",
                         "span[dir='ltr]"]) {
        for (const el of card.querySelectorAll(sel)) {
          const t = (el.textContent || "").trim();
          if (t && t.length > 1) {
            out.textCandidates.push({ sel, text: t, classes: el.className || "" });
          }
        }
      }
      out.headlineCandidates = [];
      for (const sel of [".feed-shared-update-v2__actor--headline",
                         ".feed-shared-actor__sub-description",
                         "[class*='actor__headline']", "[class*='headline']",
                         "[class*='sub-description']",
                         ".artdeco-entity-lockup__subtitle"]) {
        for (const el of card.querySelectorAll(sel)) {
          const t = (el.textContent || "").trim();
          if (t && t.length > 1) {
            out.headlineCandidates.push({ sel, text: t, classes: el.className || "" });
          }
        }
      }
      out.textBlocks = [];
      for (const el of card.querySelectorAll("span, p, div, a, time, li")) {
        const t = (el.textContent || "").trim();
        if (t && t.length > 1 && t.length < 120) {
          out.textBlocks.push(t);
          if (out.textBlocks.length >= 12) break;
        }
      }
      return out;
    })();
  `;
}

async function probeTab(page, target) {
  const tabName = target.tab.replace(/\/$/, "");
  log(`\n=== ${tabName.toUpperCase()} ===`);
  await page.goto(target.baseUrl + target.tab, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(FIRST_RENDER_WAIT_MS);
  if (isLoggedOut(page)) {
    err(`${tabName}: not logged in - run \`npm run login\` first.`);
    return false;
  }

  const cardCount = await page.evaluate(
    () => document.querySelectorAll('div[role="listitem"]').length
  );
  log(`${tabName}: ${cardCount} cards on first render.`);
  if (cardCount === 0) return false;

  await page
    .waitForFunction(
      () => {
        const cards = document.querySelectorAll('div[role="listitem"]');
        return (
          cards.length > 0 &&
          cards[0].querySelector("a[href*='/in/'], a[href*='/company/']") !==
            null
        );
      },
      { timeout: 15000 }
    )
    .catch(() => {
      err(`${tabName}: cards present but profile links not yet rendered.`);
    });

  const limit = Math.min(cardCount, MAX_CARDS);
  for (let i = 0; i < limit; i++) {
    const info = await page.evaluate(inspectCardScript(i));
    if (!info) {
      err(`  card ${i + 1}: inspector returned null.`);
      continue;
    }
    const outer = await page.evaluate((ii) => {
      const cards = document.querySelectorAll('div[role="listitem"]');
      return cards[ii] ? cards[ii].outerHTML || "" : "";
    }, i);

    log(`\n--- Card ${i + 1}/${limit} (${tabName}) ---`);
    log(`cardId=${info.cardId}`);
    log(`menuAria=${info.menuAria}`);
    if (info.links.length) {
      log("LINKS:");
      for (const l of info.links) {
        log(`  href=${l.href}`);
        log(`    fullText="${l.text}"`);
        log(`    nameSpan="${l.nameSpan}"`);
        log(`    classes="${l.classes}"`);
      }
    }
    if (info.times.length) {
      log("TIMES:");
      for (const t of info.times)
        log(`  datetime=${t.datetime} text="${t.text}"`);
    }
    if (info.textCandidates.length) {
      log("TEXT_CANDIDATES:");
      for (const c of info.textCandidates)
        log(`  [${c.sel}] "${c.text}" (${c.classes})`);
    }
    if (info.headlineCandidates.length) {
      log("HEADLINE_CANDIDATES:");
      for (const c of info.headlineCandidates)
        log(`  [${c.sel}] "${c.text}" (${c.classes})`);
    }
    if (info.textBlocks.length) {
      log("TEXT_BLOCKS:");
      for (const t of info.textBlocks) log(`  "${t}"`);
    }
    log(`OUTERHTML: ${trimHtml(outer)}`);
  }
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const typeArg = args.find((a) => !a.startsWith("--")) || "comments";
  const headless = !args.includes("--headless");

  let profileDir = ".profile-chromium";
  let chromiumPath = null;
  try {
    const cfg = JSON.parse(
      fs.readFileSync(path.resolve("config.json"), "utf8")
    );
    if (cfg.paths && cfg.paths.profileDir) profileDir = cfg.paths.profileDir;
    if (cfg.paths && cfg.paths.chromiumPath)
      chromiumPath = cfg.paths.chromiumPath;
  } catch {
    /* use defaults */
  }

  log(
    `DOM probe: type=${typeArg}, headless=${headless}, profile=${profileDir}`
  );

  let context;
  try {
    context = await launchBrowser({ profileDir, headless, chromiumPath });
  } catch (error) {
    err(
      `Could not launch the browser: ${error && error.message ? error.message : error}`
    );
    process.exitCode = 1;
    return;
  }

  const page = await context.newPage();
  await page.goto("https://www.linkedin.com/in/me/", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(3000);
  if (isLoggedOut(page)) {
    err("Not logged in. Run `npm run login` first.");
    await context.close();
    process.exitCode = 1;
    return;
  }
  const match = page.url().match(/linkedin\.com\/in\/([^/]+)/);
  const username = match ? match[1] : "me";
  const baseUrl = `https://www.linkedin.com/in/${username}/recent-activity/`;

  await injectDomHelpers(page, path.resolve("./src/linkedin-dom.js"));

  const targets = activityTargets(typeArg);
  for (const target of targets) {
    const ok = await probeTab(page, { ...target, baseUrl });
    if (!ok) break;
  }

  await context.close();
  log(
    "\nDone. Review the LINKS/TIMES/TEXT_CANDIDATES/HEADLINE_CANDIDATES blocks to write exact selectors."
  );
}

main().catch((error) => {
  err(`probe crashed: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
