/*
  DOM probe for the LinkedIn Activity List.

  Launches headed with your logged-in Chromium profile, opens the comments and
  reactions tabs (first page only - no scroll), and dumps per-card DOM
  structure so exact author/headline/date/text selectors can be written.

  Read-only: no clicks, no deletions, no scroll.

  Usage:
    node scripts/probe-dom.js                    # comments tab
    node scripts/probe-dom.js reactions          # reactions tab
    node scripts/probe-dom.js --headless         # no visible window
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
