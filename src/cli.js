import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import { URLS, TIMING, PATHS, loadConfig } from "./config.js";
import { launchBrowser, injectDomHelpers, findChromiumBinary, connectCDP, blockHeavyResources } from "./browser.js";
import { loadCheckpoint, saveCheckpoint, resetCheckpoint } from "./checkpoint.js";
import { log, warn, err } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOM_HELPER = path.join(__dirname, "linkedin-dom.js");

const args = process.argv.slice(2);
const command = args[0] || "help";

const config = loadConfig();
const cfgTiming = (config && config.timing) || TIMING;
const cfgPaths = (config && config.paths) || {};

function getFlag(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  const v = args[idx + 1];
  if (v === undefined || v.startsWith("--")) return true;
  return v;
}

function getIntFlag(name, defaultVal) {
  const v = getFlag(name, defaultVal);
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultVal;
}

function defaultProfileDir() {
  if (cfgPaths.profileDir) return cfgPaths.profileDir;
  const candidates = [
    ".profile-chromium",
    "E:/wintools/PortableApps/chromium-win64/profile",
    PATHS.profileDir,
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  return PATHS.profileDir;
}
const profileDir = path.resolve(getFlag("profile-dir", defaultProfileDir()));
const dataDir = path.resolve(getFlag("data-dir", PATHS.dataDir));
const typeArg = getFlag("type", "all");
const chromiumPath = getFlag("chromium-path", cfgPaths.chromiumPath || null);
const cdpEndpoint = getFlag("cdp", null);
const limitArg = getIntFlag("limit", 0);

const timing = {
  actionMin: getIntFlag("action-min", cfgTiming.actionMin),
  actionMax: getIntFlag("action-max", cfgTiming.actionMax),
  batchMin: getIntFlag("batch-min", cfgTiming.batchMin),
  batchMax: getIntFlag("batch-max", cfgTiming.batchMax),
  scrollWait: cfgTiming.scrollWait,
  maxEmptyScrolls: cfgTiming.maxEmptyScrolls,
  maxRetries: cfgTiming.maxRetries,
  backoffBase: cfgTiming.backoffBase,
  batchSize: cfgTiming.batchSize,
};

const headless = Boolean(getFlag("headless", false));

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans);
    });
  });
}

function typesToRun(type) {
  if (type === "all") return ["comments", "likes"];
  if (type === "comments" || type === "likes") return [type];
  throw new Error(`Unknown type: ${type}`);
}

async function ensureLoggedIn(page) {
  const url = page.url();
  if (url.includes("/login") || url.includes("/checkpoint") || url.includes("/authwall")) {
    warn("Not logged in. Run `npm run login` first.");
    return false;
  }
  return true;
}

async function collectAllKeys(page) {
  const keys = new Set();
  let stable = 0;
  let lastSize = 0;
  while (stable < 5) {
    const batch = await page.evaluate(() => window.LP.collectKeys());
    for (const k of batch) keys.add(k);

    const clicked = await page.evaluate(() => window.LP.clickShowMoreIfPresent());
    await page.waitForTimeout(clicked ? timing.scrollWait + 400 : timing.scrollWait);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(timing.scrollWait);

    if (keys.size === lastSize) stable++;
    else {
      stable = 0;
      lastSize = keys.size;
    }
    log(`collected ${keys.size} so far...`);
  }
  return [...keys];
}

async function runLogin() {
  const context = await launchBrowser({ profileDir, headless: false, chromiumPath });
  const page = await context.newPage();
  await injectDomHelpers(page, DOM_HELPER);
  await page.goto(URLS.login, { waitUntil: "domcontentloaded" });
  log("Browser opened. Log in to LinkedIn, then press Enter here to save and close.");
  await ask("Press Enter when logged in... ");
  await context.close();
  log("Profile saved to " + profileDir);
}

const DEFAULT_CHROMIUM_PROFILE = "E:/wintools/PortableApps/chromium-win64/profile";

async function runCopyChromiumProfile() {
  const src = getFlag("source", DEFAULT_CHROMIUM_PROFILE);
  const dest = path.resolve(getFlag("profile-dir", ".profile-chromium"));
  log(`Source profile: ${src}`);
  log(`Destination: ${dest}`);
  if (!fs.existsSync(src)) {
    err("Source profile not found: " + src);
    process.exit(1);
  }
  if (fs.existsSync(dest)) {
    log("Removing existing destination...");
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.cpSync(src, dest, { recursive: true, force: true });
  } finally {
    // Remove Chromium profile lock files (SingletonLock etc.) copied from a live profile.
    try {
      for (const name of fs.readdirSync(dest)) {
        if (/lock/i.test(name)) {
          try { fs.rmSync(path.join(dest, name), { recursive: true, force: true }); } catch {}
        }
      }
    } catch {}
  }
  log("Copied. Run with --profile-dir " + dest);
}

async function runScan() {
  let context, ownsBrowser = true;
  if (cdpEndpoint) {
    const res = await connectCDP(cdpEndpoint);
    context = res.context;
    ownsBrowser = false;
  } else {
    context = await launchBrowser({ profileDir, headless, chromiumPath });
  }
  const page = await context.newPage();
  await injectDomHelpers(page, DOM_HELPER);
  await blockHeavyResources(page);

  // Resolve the real profile base URL (LinkedIn redirects /in/me/ to /in/<username>/).
  await page.goto("https://www.linkedin.com/in/me/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const meUrl = page.url();
  const usernameMatch = meUrl.match(/linkedin\.com\/in\/([^/]+)/);
  const username = usernameMatch ? usernameMatch[1] : "me";
  const baseUrl = `https://www.linkedin.com/in/${username}/recent-activity/`;
  await page.goto(baseUrl + "all/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  if (!(await ensureLoggedIn(page))) {
    if (ownsBrowser) await context.close(); else await page.close();
    return;
  }

  for (const t of typesToRun(typeArg)) {
    log(`=== Scanning ${t} ===`);
    const tab = t === "comments" ? "comments/" : "reactions/";
    await page.goto(baseUrl + tab, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    if (!(await ensureLoggedIn(page))) {
      if (ownsBrowser) await context.close(); else await page.close();
      return;
    }
    const keys = await collectAllKeys(page);
    const out = path.join(dataDir, `scan-${t}.json`);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ type: t, count: keys.length, keys, scannedAt: new Date().toISOString() }, null, 2));
    log(`${t}: ${keys.length} items found -> ${out}`);
  }
  if (ownsBrowser) await context.close(); else await page.close();
}

async function runPurge() {
  let context, ownsBrowser = true;
  if (cdpEndpoint) {
    const res = await connectCDP(cdpEndpoint);
    context = res.context;
    ownsBrowser = false;
  } else {
    context = await launchBrowser({ profileDir, headless, chromiumPath });
  }
  const page = await context.newPage();
  await injectDomHelpers(page, DOM_HELPER);
  await blockHeavyResources(page);

  await page.goto("https://www.linkedin.com/in/me/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const meUrl = page.url();
  const usernameMatch = meUrl.match(/linkedin\.com\/in\/([^/]+)/);
  const username = usernameMatch ? usernameMatch[1] : "me";
  const baseUrl = `https://www.linkedin.com/in/${username}/recent-activity/`;
  await page.goto(baseUrl + "all/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  if (!(await ensureLoggedIn(page))) {
    if (ownsBrowser) await context.close(); else await page.close();
    return;
  }

  let stopped = false;
  process.on("SIGINT", () => {
    stopped = true;
    warn("Stop requested; finishing current item then halting.");
  });

  for (const t of typesToRun(typeArg)) {
    log(`=== Purging ${t} ===`);
    const tab = t === "comments" ? "comments/" : "reactions/";
    await page.goto(baseUrl + tab, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    if (!(await ensureLoggedIn(page))) {
      if (ownsBrowser) await context.close(); else await page.close();
      return;
    }

    // Collect candidates
    log("Collecting items...");
    const keys = await collectAllKeys(page);
    log(`${t}: ${keys.length} items collected.`);

    const cp = loadCheckpoint(dataDir, t);
    const pendingCount = keys.filter((k) => !cp.processed.has(k)).length;
    log(`Already processed: ${cp.processed.size}. Pending: ${pendingCount}.`);

    if (pendingCount === 0) {
      log("Nothing to do for " + t);
      continue;
    }

    const answer = await ask(`Delete ${pendingCount} ${t} items? Type YES to proceed: `);
    if (answer.trim() !== "YES") {
      log("Aborted by user for " + t);
      continue;
    }

    const report = [];
    let deleted = 0;
    let retries = 0;
    let emptyScrolls = 0;

    while (!stopped) {
      let result;
      try {
        result = await page.evaluate((skipArr) => window.LP.deleteFirstEligible(skipArr), [...cp.processed]);
      } catch (e) {
        result = { ok: false, key: null, skip: false, error: e.message };
      }

      if (result && result.ok) {
        deleted++;
        retries = 0;
        emptyScrolls = 0;
        cp.processed.add(result.key);
        if (limitArg > 0 && deleted >= limitArg) {
          log(`Limit of ${limitArg} reached.`);
          stopped = true;
        }
        report.push({ key: result.key, ts: new Date().toISOString() });
        log(`deleted ${result.key} (${deleted} this run, ${cp.processed.size} total)`);

        if (deleted % timing.batchSize === 0) {
          saveCheckpoint(dataDir, t, cp.processed);
          log(`  checkpoint saved (${cp.processed.size} processed)`);
        }

        if (deleted % timing.batchSize === 0) {
          const pause = rand(timing.batchMin, timing.batchMax);
          log(`  batch pause ${Math.round(pause / 1000)}s`);
          await page.waitForTimeout(pause);
        } else {
          await page.waitForTimeout(rand(timing.actionMin, timing.actionMax));
        }
        continue;
      }

      if (result && result.skip) {
        warn(`  skipped: ${result.error} (${result.key})`);
        emptyScrolls = 0;
        await page.waitForTimeout(rand(timing.actionMin, timing.actionMax));
        continue;
      }

      if (result && result.key === null) {
        // no eligible item visible; scroll / load more
        const clicked = await page.evaluate(() => window.LP.clickShowMoreIfPresent());
        await page.waitForTimeout(clicked ? 2000 : 1200);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1200);

        const currentKeys = await page.evaluate(() => window.LP.collectKeys());
        const hasPending = currentKeys.some((k) => !cp.processed.has(k));
        if (!hasPending) {
          emptyScrolls++;
          if (emptyScrolls >= timing.maxEmptyScrolls) {
            log("No more items found.");
            break;
          }
        } else {
          emptyScrolls = 0;
        }
        continue;
      }

      // retryable failure
      retries++;
      warn(`  failed: ${result ? result.error : "unknown"} (retry ${retries})`);
      if (retries > timing.maxRetries) {
        err("Too many consecutive failures; stopping this run.");
        break;
      }
      const backoff = timing.backoffBase * Math.pow(2, retries - 1);
      log(`  backoff ${Math.round(backoff / 1000)}s`);
      await page.waitForTimeout(backoff);
    }

    saveCheckpoint(dataDir, t, cp.processed);
    log(`Finished ${t}: deleted ${deleted} this run. Total processed ${cp.processed.size}.`);

    if (report.length > 0) {
      const reportPath = path.join(dataDir, `report-${t}-${Date.now()}.json`);
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify({ type: t, deleted: report.length, items: report }, null, 2));
      log(`Report written: ${reportPath}`);
    }
    if (stopped) break;
  }

  if (ownsBrowser) await context.close(); else await page.close();
  log("Done.");
}

async function runStatus() {
  for (const t of typesToRun(typeArg)) {
    const cp = loadCheckpoint(dataDir, t);
    log(`${t}: ${cp.processed.size} processed`);
  }
}

function printHelp() {
  console.log(`linkedin-purge

Commands:
  login            Open a headed browser to log in; saves profile.
  copy-chromium-profile  Copy the chrlauncher Chromium profile into .profile-chromium.
  scan             Collect item counts (dry-run) for --type.
  purge            Scan, confirm, then delete with pacing.
  status           Show checkpoint progress.

Flags:
  --type comments|likes|all   (default all)
  --profile-dir <dir>         (default: .profile-chromium, then chrlauncher profile, then .profile)
  --data-dir <dir>            (default data)
  --chromium-path <path>      (default auto-detect portable Chromium)
  --cdp <endpoint>            Attach to a running Chromium via CDP (e.g. http://localhost:9222)
  --limit <n>                 Stop after deleting n items (0 = unlimited)
  --headless                  run browser headless
  --action-min/--action-max   per-action delay ms (default 2000/5000)
  --batch-min/--batch-max     per-10 batch pause ms (default 30000/60000)
  --reset-checkpoint          delete checkpoint before run (purge only)
`);
}

(async () => {
  try {
    if (command === "login") await runLogin();
    else if (command === "copy-chromium-profile") await runCopyChromiumProfile();
    else if (command === "scan") await runScan();
    else if (command === "purge") {
      if (getFlag("reset-checkpoint", false)) {
        for (const t of typesToRun(typeArg)) resetCheckpoint(dataDir, t);
        log("Checkpoints reset.");
      }
      await runPurge();
    } else if (command === "status") await runStatus();
    else printHelp();
  } catch (e) {
    err(e && e.stack ? e.stack : String(e));
    process.exit(1);
  }
})();