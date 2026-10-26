// CLI scan command
import fs from "node:fs";
import path from "node:path";
import { launchBrowser, injectDomHelpers } from "../browser.js";
import { log, warn, err } from "../logger.js";
import { loadCheckpoint, resetCheckpoint } from "../checkpoint.js";

export async function runScan(args) {
  // Get all the command arguments  
  const profileDir = getFlag(args, "profile-dir", ".profile-chromium");
  const dataDir = path.resolve(getFlag(args, "data-dir", "data"));
  const typeArg = getFlag(args, "type", "all");
  const chromiumPath = getFlag(args, "chromium-path", null);
  const cdpEndpoint = getFlag(args, "cdp", null);

  function typesToRun(type) {
    if (type === "all") return ["comments", "likes"];
    if (type === "comments" || type === "likes") return [type];
    throw new Error(`Unknown type: ${type}`);
  }

  const context = await launchBrowser({ profileDir, headless: false, chromiumPath });
  const page = await context.newPage();
  await injectDomHelpers(page, "./linkedin-dom.js");

  // Login check logic (simplified version)
  const url = page.url();
  if (url.includes("/login") || url.includes("/checkpoint") || url.includes("/authwall")) {
    warn("Not logged in. Run `npm run login` first.");
    await context.close();
    return;
  }

  for (const t of typesToRun(typeArg)) {
    log(`=== Scanning ${t} ===`);
    const tab = t === "comments" ? "comments/" : "reactions/";
    await page.goto("https://www.linkedin.com/in/me/recent-activity/" + tab, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    // Login check again
    const url2 = page.url();
    if (url2.includes("/login") || url2.includes("/checkpoint") || url2.includes("/authwall")) {
      warn("Not logged in. Run `npm run login` first.");
      await context.close();
      return;
    }
    
    const keys = await page.evaluate(() => window.LP.collectKeys());
    const out = path.join(dataDir, `scan-${t}.json`);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ type: t, count: keys.length, keys, scannedAt: new Date().toISOString() }, null, 2));
    log(`${t}: ${keys.length} items found -> ${out}`);
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