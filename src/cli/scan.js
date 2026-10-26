// CLI scan command
import fs from "node:fs";
import path from "node:path";
import { launchBrowser, injectDomHelpers } from "../browser.js";
import { log, warn, err } from "../logger.js";
import { loadCheckpoint, resetCheckpoint } from "../checkpoint.js";
import { resolveFlag, asBool } from "./config.js";

export async function runScan(args) {
  // CLI flag > config.json > built-in default.
  const profileDir = resolveFlag(args, "profile-dir", "paths.profileDir", ".profile-chromium");
  const dataDir = path.resolve(resolveFlag(args, "data-dir", "paths.dataDir", "data"));
  const typeArg = getFlag(args, "type", "all");
  const chromiumPath = resolveFlag(args, "chromium-path", "paths.chromiumPath", null);
  const cdpEndpoint = getFlag(args, "cdp", null);

  function typesToRun(type) {
    if (type === "all") return ["comments", "likes"];
    if (type === "comments" || type === "likes") return [type];
    throw new Error(`Unknown type: ${type}`);
  }

  // Scan is the exception per user spec: defaults to headless=true.
  // Config's `behavior.headless` (false) is a global default for purge/login.
  const headless = asBool(getFlag(args, "headless"), true);
  const context = await launchBrowser({ profileDir, headless, chromiumPath });
  const page = await context.newPage();
  const linkedinDomPath = path.resolve("./src/linkedin-dom.js");
  await injectDomHelpers(page, linkedinDomPath);

  // Login check logic (simplified version)
  const url = page.url();
  if (url.includes("/login") || url.includes("/checkpoint") || url.includes("/authwall")) {
    warn("Not logged in. Run `npm run login` first.");
    await context.close();
    return;
  }

  // Get base URL for the user's profile
  await page.goto("https://www.linkedin.com/in/me/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const meUrl = page.url();
  const usernameMatch = meUrl.match(/linkedin\.com\/in\/([^/]+)/);
  const username = usernameMatch ? usernameMatch[1] : "me";
  const baseUrl = `https://www.linkedin.com/in/${username}/recent-activity/`;

  for (const t of typesToRun(typeArg)) {
    log(`=== Scanning ${t} ===`);
    const tab = t === "comments" ? "comments/" : "reactions/";
    await page.goto(baseUrl + tab, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    // Login check again
    const url2 = page.url();
    if (url2.includes("/login") || url2.includes("/checkpoint") || url2.includes("/authwall")) {
      warn("Not logged in. Run `npm run login` first.");
      await context.close();
      return;
    }

    const items = await page.evaluate(() => window.LP.collectItems());
    const out = path.join(dataDir, `scan-${t}.json`);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(out, JSON.stringify({
      type: t,
      count: items.length,
      keys: items.map((it) => it.key).filter(Boolean),
      items,
      scannedAt: new Date().toISOString(),
    }, null, 2));
    log(`${t}: ${items.length} items found -> ${out}`);
  }
  await context.close();
}

function getFlag(args, name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  const v = args[idx + 1];
  if (v === undefined || v.startsWith("--")) return true;
  return v;
}
