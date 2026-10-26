// CLI purge command
import fs from "node:fs";
import path from "node:path";
import { launchBrowser, injectDomHelpers } from "../browser.js";
import { loadCheckpoint, resetCheckpoint } from "../checkpoint.js";
import { log, warn } from "../logger.js";

export async function runPurge(args) {
  const profileDir = getFlag(args, "profile-dir", ".profile-chromium");
  const dataDir = path.resolve(getFlag(args, "data-dir", "data"));
  const typeArg = getFlag(args, "type", "all");
  const chromiumPath = getFlag(args, "chromium-path", null);
  const limitArg = getIntFlag(args, "limit", 0);
  const resetCheckpointArg = getFlag(args, "reset-checkpoint", false);

  function typesToRun(type) {
    if (type === "all") return ["comments", "likes"];
    if (type === "comments" || type === "likes") return [type];
    throw new Error(`Unknown type: ${type}`);
  }

  // Reset checkpoint if requested
  if (resetCheckpointArg) {
    for (const t of typesToRun(typeArg)) resetCheckpoint(dataDir, t);
    log("Checkpoints reset.");
  }
  
  const context = await launchBrowser({ profileDir, headless: false, chromiumPath });
  const page = await context.newPage();
  await injectDomHelpers(page, "./linkedin-dom.js");

  // Login check logic 
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

  // Navigate to activity page 
  await page.goto(baseUrl + "all/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);

  // Login check again
  const url2 = page.url();
  if (url2.includes("/login") || url2.includes("/checkpoint") || url2.includes("/authwall")) {
    warn("Not logged in. Run `npm run login` first.");
    await context.close();
    return;
  }

  // Setup and run purge
  const { PurgeRunner, PageAdapter, CheckpointAdapter, ReporterAdapter, ConfirmAdapter } = await import("../purge/index.js");
  
  try {
    const pageAdapter = new PageAdapter(page);
    const checkpointAdapter = new CheckpointAdapter(dataDir, typeArg);
    const reporterAdapter = new ReporterAdapter({ dataDir: dataDir || "data" });
    const confirmAdapter = new ConfirmAdapter();
  
    const runner = new PurgeRunner({ pageAdapter, checkpointAdapter, reporterAdapter, confirmAdapter });
    
    // Run the purge
    const result = await runner.run({
      type: typeArg,
      timeoutMs: 3600000,
      batchSize: 10,
      limit: limitArg,
    });

    if (result && result.deleted > 0) {
      log(`${result.type}: ${result.deleted} items deleted, ${result.processed} processed`);
      if (result.reportPath) log(`Report written: ${result.reportPath}`);
    } else if (result && result.deleted === 0) {
      log("Purge cancelled or nothing to delete.");
    }

    await context.close();
    log("Done.");
  } catch (error) {
    console.error('Error running purge:', error);
    await context.close();
    throw error;
  }
}

// Helper functions for flag parsing
function getFlag(args, name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  const v = args[idx + 1];
  if (v === undefined || v.startsWith("--")) return true;
  return v;
}

function getIntFlag(args, name, defaultVal) {
  const v = getFlag(args, name, defaultVal);
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultVal;
}