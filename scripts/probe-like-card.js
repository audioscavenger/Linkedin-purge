/*
  Probe likes cards for post text location.
  Read-only, no scroll, no clicks.
*/
import path from "node:path";
import fs from "node:fs";
import { launchBrowser } from "../src/browser.js";
import { isLoggedOut } from "../src/login-guard.js";
import { log, err } from "../src/logger.js";

const FIRST_RENDER_WAIT_MS = 8000;

async function main() {
  const args = process.argv.slice(2);
  const cardIdx = args.find((a) => !a.startsWith("--")) || "0";
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

  log(`Like card probe: card=${cardIdx}, headless=${headless}`);

  let context;
  try {
    context = await launchBrowser({ profileDir, headless, chromiumPath });
  } catch (error) {
    err(`Could not launch: ${error && error.message ? error.message : error}`);
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

  await page.goto(baseUrl + "reactions/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(FIRST_RENDER_WAIT_MS);
  if (isLoggedOut(page)) {
    err("Not logged in on reactions tab.");
    await context.close();
    process.exitCode = 1;
    return;
  }

  const outer = await page.evaluate((idx) => {
    const cards = document.querySelectorAll('div[role="listitem"]');
    return cards[idx] ? cards[idx].outerHTML : null;
  }, Number(cardIdx));

  if (!outer) {
    err(`No card at index ${cardIdx}.`);
    await context.close();
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync("/tmp/like-card-outer.html", outer);
  log(
    `Full outerHTML written to /tmp/like-card-outer.html (${outer.length} chars)`
  );

  const textMap = await page.evaluate((idx) => {
    const cards = document.querySelectorAll('div[role="listitem"]');
    const card = cards[idx];
    const out = [];
    for (const el of card.querySelectorAll("*")) {
      const t = (el.textContent || "").trim();
      if (t && t.length > 0) {
        out.push({ tag: el.tagName, classes: el.className || "", text: t });
      }
    }
    return out;
  }, Number(cardIdx));

  log("\nALL TEXT NODES IN CARD:");
  for (const node of textMap) {
    log(`  <${node.tag} class="${node.classes}"> "${node.text}"`);
  }

  await context.close();
}

main().catch((error) => {
  err(`crashed: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
