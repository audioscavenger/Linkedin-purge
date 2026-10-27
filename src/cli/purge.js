// CLI purge command
import path from "node:path";
import { launchBrowser, injectDomHelpers } from "../browser.js";
import { resetCheckpoint } from "../checkpoint.js";
import { log, warn } from "../logger.js";
import { PurgeRunner, PageAdapter, CheckpointAdapter, ReporterAdapter, ConfirmAdapter } from "../purge/index.js";
import { purgeTargets } from "../purge/targets.js";
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

  // One Purge Run per concrete type, each on the Activity List tab where its
  // page detector matches. Resolved before the browser launches, so an unknown
  // type fails without a visit.
  const targets = purgeTargets(typeArg);

  // Reset checkpoint if requested
  if (resetCheckpointArg) {
    for (const target of targets) resetCheckpoint(dataDir, target.type);
    log("Checkpoints reset.");
  }

  const context = await launchBrowser({ profileDir, headless, chromiumPath });
  const page = await context.newPage();
  const linkedinDomPath = path.resolve("./src/linkedin-dom.js");
  await injectDomHelpers(page, linkedinDomPath);

  // Login check logic
  if (isLoggedOut(page)) {
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

  // Load input keys if --input was specified
  let inputKeys = null;
  if (inputFile) {
    inputKeys = loadInputKeys(inputFile);
    log(`Loaded ${inputKeys.length} keys from ${inputFile}`);
  }

  // Everything a run needs except its type, which is per target.
  const runOptions = {
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
  };

  try {
    const results = [];
    for (const target of targets) {
      log(`=== Purging ${target.type} ===`);
      await page.goto(baseUrl + target.tab, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(5000);

      // Login check again, as scan does: a session that expires between tabs
      // must stop the run instead of purging whatever the login page renders.
      if (isLoggedOut(page)) {
        warn("Not logged in. Run `npm run login` first.");
        await context.close();
        return;
      }

      // The adapters are per type: the checkpoint and the report are named
      // after the concrete type being purged, never after the --type argument,
      // so `all` writes checkpoint-comments.json + checkpoint-likes.json rather
      // than a checkpoint-all.json that nothing would ever resume.
      const runner = new PurgeRunner({
        pageAdapter: new PageAdapter(page),
        checkpointAdapter: new CheckpointAdapter(dataDir, target.type),
        reporterAdapter: new ReporterAdapter({ dataDir }),
        confirmAdapter: new ConfirmAdapter(),
      });

      // The runner asks its own confirmation prompt once per type.
      results.push(await runner.run({ type: target.type, ...runOptions }));
    }

    reportSummary(results);
    await context.close();
    log("Done.");
  } catch (error) {
    console.error('Error running purge:', error);
    await context.close();
    throw error;
  }
}

// A login, checkpoint or authwall redirect means the session ended; nothing on
// the page is what the run thinks it is.
function isLoggedOut(page) {
  const url = page.url();
  return url.includes("/login") || url.includes("/checkpoint") || url.includes("/authwall");
}

// Closing summary across every Purge Run of this invocation: one line per type
// with its own report path, plus a total when more than one type ran.
function reportSummary(results) {
  for (const result of results) {
    if (result.deleted > 0) {
      log(`${result.type}: ${result.deleted} items deleted, ${result.processed} processed`);
      if (result.reportPath) log(`Report written: ${result.reportPath}`);
    } else if (result.deleted === 0) {
      log(`${result.type}: purge cancelled or nothing to delete.`);
    }
  }
  if (results.length > 1) {
    const deleted = results.reduce((sum, result) => sum + result.deleted, 0);
    log(`Total: ${deleted} items deleted across ${results.length} types.`);
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
