// CLI purge command
import path from "node:path";
import { launchBrowser, injectDomHelpers } from "../browser.js";
import { log, warn } from "../logger.js";
import { PurgeRunner, PageAdapter, ConfirmAdapter } from "../purge.js";
import { EnvelopeStore } from "../envelope-store.js";
import { loadSelection } from "./selection.js";
import { activityTargets } from "../activity-targets.js";
import { isLoggedOut } from "../login-guard.js";
import { resolveFlag, asBool, asInt, loadConfig } from "./config.js";

export async function runPurge(args) {
  // Loudly refuse the retired flag instead of silently ignoring it: statuses
  // live in the scan envelope now (ticket 23). Nothing is purged, no browser
  // is launched.
  if (args.includes("--reset-checkpoint")) {
    console.error("--reset-checkpoint was removed in 0.5.0: purge statuses now live in the scan envelope (data/scan-<type>.json). Pass nothing instead - the envelope is updated item by item as purge runs.");
    process.exit(1);
  }

  // CLI flag > config.json > built-in default.
  const profileDir = resolveFlag(args, "profile-dir", "paths.profileDir", ".profile-chromium");
  const dataDir = path.resolve(resolveFlag(args, "data-dir", "paths.dataDir", "data"));
  const typeArg = getFlag(args, "type", "all");
  const chromiumPath = resolveFlag(args, "chromium-path", "paths.chromiumPath", null);
  const limitArg = asInt(resolveFlag(args, "limit", "behavior.limit", 0), 0);
  const headless = asBool(resolveFlag(args, "headless", "behavior.headless", false), false);
  // Optional: restrict deletion to a selection from --input. This is the
  // v0.5.0 review-first flow: scan writes data/selection-<type>.html from the
  // scan envelope, the person ticks the items worth deleting, Export writes
  // data/selection-<type>.json with status: pending, and purge --input acts
  // on that file. Selected items outside the selection are never touched.
  const inputFile = getFlag(args, "input", null);

  // Load the selection before the browser launches, so an unusable file fails
  // without a visit. Statuses already final (purged) or no-op are skipped;
  // anything pending/failed/not-found is actionable, and a selection with
  // zero actionable items exits without prompting.
  let selection = null;
  if (inputFile) {
    selection = loadSelection(inputFile);
    log(`Selection: ${selection.total} items in ${inputFile} (${selection.actionable} actionable).`);
    if (selection.actionable === 0) {
      log("Nothing actionable in the selection; exiting without prompting.");
      return;
    }
  }

  // Timing options, all overridable via CLI.
  const timing = loadConfig().timing || {};
  const actionMin = asInt(resolveFlag(args, "action-min", "timing.actionMin", 2000), 2000);
  const actionMax = asInt(resolveFlag(args, "action-max", "timing.actionMax", 5000), 5000);
  const batchMin = asInt(resolveFlag(args, "batch-min", "timing.batchMin", 30000), 30000);
  const batchMax = asInt(resolveFlag(args, "batch-max", "timing.batchMax", 60000), 60000);

  // One Purge Run per concrete type, each on the Activity List tab where its
  // page detector matches. Resolved before the browser launches, so an unknown
  // type fails without a visit. A selection file carries its own type.
  const targetType = selection && selection.type ? selection.type : typeArg;
  const targets = activityTargets(targetType);

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
  const inputKeys = selection ? selection.identities : null;

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

      // The adapters are per type: neither flow wires checkpoint or report
      // anymore (both retired in tickets 23/24). A selection run persists
      // statuses straight into the selection envelope through the store; a
      // full purge run wires nothing writable.
      const runner = new PurgeRunner({
        pageAdapter: new PageAdapter(page),
        confirmAdapter: new ConfirmAdapter(),
        envelopeStore: inputFile ? new EnvelopeStore(path.resolve(inputFile)) : null,
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

// Closing summary across every Purge Run of this invocation: one line per type
// with its own report path, plus a total when more than one type ran.
function reportSummary(results) {
  for (const result of results) {
    if (result.deleted > 0) {
      log(`${result.type}: ${result.deleted} items deleted`);
    } else if (result.deleted === 0) {
      log(`${result.type}: purge cancelled or nothing to delete.`);
    }
    if (result.counts) {
      // Selection runs: per-status tally appended regardless of deletions.
      const c = result.counts;
      log(`${result.type}: ${c.purged} purged, ${c.failed} failed, ${c.notFound} not-found, ${c.noOp} no-op`);
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
