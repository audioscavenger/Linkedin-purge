// CLI scan command
import fs from "node:fs";
import path from "node:path";
import { launchBrowser, injectDomHelpers } from "../browser.js";
import { log, warn } from "../logger.js";
import { resolveFlag, asBool, loadConfig } from "./config.js";
import { ActivityLoader, createActivityPage } from "../activity-loader.js";
import { buildScanEnvelope } from "../scan-envelope.js";
import { activityTargets } from "../activity-targets.js";
import { isLoggedOut } from "../login-guard.js";

export async function runScan(args) {
  // CLI flag > config.json > built-in default.
  const profileDir = resolveFlag(args, "profile-dir", "paths.profileDir", ".profile-chromium");
  const dataDir = path.resolve(resolveFlag(args, "data-dir", "paths.dataDir", "data"));
  const typeArg = getFlag(args, "type", "all");
  const chromiumPath = resolveFlag(args, "chromium-path", "paths.chromiumPath", null);
  const cdpEndpoint = getFlag(args, "cdp", null);
  // Deep is opt-in: the CLI flag, then behavior.deepScan, then false.
  const deep = asBool(resolveFlag(args, "deep", "behavior.deepScan", false));
  // The loader's stopping rules reuse the existing timing knobs: growthWait is
  // now the per-step growth deadline, maxEmptyScrolls the idle limit and
  // timeout the overall walk limit (0 = none).
  const timing = loadConfig().timing || {};

  // One scan per concrete type, resolved before the browser launches so an
  // unknown type fails without a visit.
  const targets = activityTargets(typeArg);

  // Scan is the exception per user spec: defaults to headless=true.
  // Config's `behavior.headless` (false) is a global default for purge/login.
  const headless = asBool(getFlag(args, "headless"), true);
  const context = await launchBrowser({ profileDir, headless, chromiumPath });
  const page = await context.newPage();
  const linkedinDomPath = path.resolve("./src/linkedin-dom.js");
  await injectDomHelpers(page, linkedinDomPath);

  // Login check logic (simplified version)
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

  for (const target of targets) {
    const t = target.type;
    log(`=== Scanning ${t}${deep ? " (deep)" : ""} ===`);
    await page.goto(baseUrl + target.tab, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    // Login check again
    if (isLoggedOut(page)) {
      warn("Not logged in. Run `npm run login` first.");
      await context.close();
      return;
    }

    const loader = new ActivityLoader({
      page: createActivityPage(page),
      timing,
      onStep: (event) => log(stepLine(t, event)),
    });
    // Deep walks the Activity List; plain scan reads the first render only.
    const result = deep ? await loader.collectAll() : await loader.readFirstRender();

    const out = path.join(dataDir, `scan-${t}.json`);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(out, JSON.stringify(buildScanEnvelope({
      type: t,
      items: result.items,
      steps: result.steps,
      complete: result.complete,
    }), null, 2));
    if (!result.complete) {
      warn(
        `${t}: the walk hit the timeout after ${result.steps} steps; ` +
          `the file holds the ${result.items.length} items collected so far and is marked complete: false.`
      );
    }
    log(`${t}: ${result.items.length} items, ${result.steps} steps, ${result.complete ? "complete" : "INCOMPLETE"} -> ${out}`);
  }
  await context.close();
}

// One progress line per load step: step number, running item count, delta and
// the wait the step cost, plus the scroll target when there was one.
function stepLine(type, event) {
  const target = event.target;
  const where = target && (target.id || target.tag) ? ` target=${target.tag || "?"}${target.id ? "#" + target.id : ""}` : "";
  return `${type} step ${event.step}: ${event.total} items (+${event.added}), waited ${event.waitedMs}ms${where}`;
}

function getFlag(args, name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  const v = args[idx + 1];
  if (v === undefined || v.startsWith("--")) return true;
  return v;
}
