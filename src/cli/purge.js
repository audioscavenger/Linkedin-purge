// CLI purge command
import path from "node:path";
import { launchBrowser, injectDomHelpers } from "../browser.js";
import { loadCheckpoint, resetCheckpoint } from "../checkpoint.js";
import { log, warn } from "../logger.js";
import { resolveFlag, asBool, asInt, loadConfig } from "./config.js";
import { loadInputKeys } from "./input-keys.js";

export async function runPurge(args) {
  // CLI flag > config.json > built-in default.
  const profileDir = resolveFlag(args, "profile-dir", "paths.profileDir", ".profile-chromium");
  const dataDir = path.resolve(resolveFlag(args, "data-dir", "paths.dataDir", "data"));
  const typeArg = getFlag(args, "type", "all");
  const chromiumPath = resolveFlag(args, "chromium-path", "paths.chromiumPath", null);
  const limitArg = asInt(resolveFlag(args, "limit", "behavior.limit", 0), 0);
  const resetCheckpointArg = asBool(resolveFlag(args, "reset-checkpoint", "behavior.resetCheckpoint", false), false);
  const headless = asBool(resolveFlag(args, "headless", "behavior.headless", false), false);
  // Optional: restrict deletion to a specific set of keys (from --input file).
  const inputFile = getFlag(args, "input", null);

  // Timing options, all overridable via CLI.
  const timing = loadConfig().timing || {};
  const actionMin = asInt(resolveFlag(args, "action-min", "timing.actionMin", 2000), 2000);
  const actionMax = asInt(resolveFlag(args, "action-max", "timing.actionMax", 5000), 5000);
  const batchMin = asInt(resolveFlag(args, "batch-min", "timing.batchMin", 30000), 30000);
  const batchMax = asInt(resolveFlag(args, "batch-max", "timing.batchMax", 60000), 60000);

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

  const context = await launchBrowser({ profileDir, headless, chromiumPath });
  const page = await context.newPage();
  const linkedinDomPath = path.resolve("./src/linkedin-dom.js");
  await injectDomHelpers(page, linkedinDomPath);

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

  // Load input keys if --input was specified
  let inputKeys = null;
  if (inputFile) {
    inputKeys = loadInputKeys(inputFile);
    log(`Loaded ${inputKeys.length} keys from ${inputFile}`);
  }

  // Setup and run purge
  const { PurgeRunner, PageAdapter, CheckpointAdapter, ReporterAdapter, ConfirmAdapter } = await import("../purge/index.js");

  try {
    const pageAdapter = new PageAdapter(page);
    const checkpointAdapter = new CheckpointAdapter(dataDir, typeArg);
    const reporterAdapter = new ReporterAdapter({ dataDir: dataDir || "data" });
    const confirmAdapter = new ConfirmAdapter();

    const runner = new PurgeRunner({ pageAdapter, checkpointAdapter, reporterAdapter, confirmAdapter });

    // Run the purge, passing all timing options from config/CLI.
    const result = await runner.run({
      type: typeArg,
      timeoutMs: asInt(timing.timeout, 3600000),
      batchSize: asInt(timing.batchSize, 10),
      maxRetries: asInt(timing.maxRetries, 4),
      maxEmptyScrolls: asInt(timing.maxEmptyScrolls, 8),
      backoffBase: asInt(timing.backoffBase, 10000),
      actionMin,
      actionMax,
      batchMin,
      batchMax,
      limit: limitArg,
      inputKeys,
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

// Helper for flags that don't have a config.json source of truth (--type).
function getFlag(args, name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  const v = args[idx + 1];
  if (v === undefined || v.startsWith("--")) return true;
  return v;
}
