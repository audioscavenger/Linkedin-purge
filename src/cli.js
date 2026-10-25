import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { URLS, loadConfig, PATHS, TIMING } from "./config.js";
import { launchBrowser, injectDomHelpers, findChromiumBinary, connectCDP, blockHeavyResources } from "./browser.js";
import { loadCheckpoint, saveCheckpoint, resetCheckpoint } from "./checkpoint.js";
import { log, warn, err } from "./logger.js";
import { PurgeRunner, PageAdapter, CheckpointAdapter, ReporterAdapter, ConfirmAdapter } from "./purge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// --- Browser-side setup: navigate to /in/me/ and resolve profile base URL ---

async function resolveBaseUrl(page) {
  await page.goto("https://www.linkedin.com/in/me/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const meUrl = page.url();
  const usernameMatch = meUrl.match(/linkedin\.com\/in\/([^/]+)/);
  const username = usernameMatch ? usernameMatch[1] : "me";
  const baseUrl = `https://www.linkedin.com/in/${username}/recent-activity/`;
  await page.goto(baseUrl + "all/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  return baseUrl;
}

async function openPageAndInject(page) {
  await injectDomHelpers(page, path.join(__dirname, "linkedin-dom.js"));
  await blockHeavyResources(page);
  return resolveBaseUrl(page);
}

export async function runPurge() {
  let context, ownsBrowser = true;
  if (cdpEndpoint) {
    const res = await connectCDP(cdpEndpoint);
    context = res.context;
    ownsBrowser = false;
  } else {
    context = await launchBrowser({ profileDir, headless: false, chromiumPath });
  }
  const page = await context.newPage();
  await openPageAndInject(page);
  if (!(await ensureLoggedIn(page))) {
    if (ownsBrowser) await context.close(); else await page.close();
    return;
  }

  // Build concrete adapters for the Purge Runner
  const pageAdapter = new PageAdapter(page);
  const checkpointAdapter = new CheckpointAdapter(dataDir, typeArg);
  const reporterAdapter = new ReporterAdapter({ dataDir: cfgPaths.dataDir || "data" });
  const confirmAdapter = new ConfirmAdapter();

  const runner = new PurgeRunner({ pageAdapter, checkpointAdapter, reporterAdapter, confirmAdapter });
  const result = await runner.run({ type: typeArg, timeoutMs: cfgTiming.timeout, batchSize: cfgTiming.batchSize });

  if (result && result.deleted > 0) {
    log(`${type}: ${result.deleted} items deleted, ${result.processed} processed`);
    if (result.reportPath) log(`Report written: ${result.reportPath}`);
  } else if (result && result.deleted === 0) {
    log("Purge cancelled or nothing to delete.");
  }

  if (ownsBrowser) await context.close(); else await page.close();
  log("Done.");
}

async function runLogin() {
  const context = await launchBrowser({ profileDir, headless: false, chromiumPath });
  const page = await context.newPage();
  await injectDomHelpers(page, path.join(__dirname, "linkedin-dom.js"));
  await page.goto(URLS.login, { waitUntil: "domcontentloaded" });
  log("Browser opened. Log in to LinkedIn, then press Enter here to save and close.");
  const answer = await ask("Press Enter when logged in... ");
  await context.close();
  log("Profile saved to " + profileDir);
}

async function runScan() {
  let context, ownsBrowser = true;
  if (cdpEndpoint) {
    const res = await connectCDP(cdpEndpoint);
    context = res.context;
    ownsBrowser = false;
  } else {
    context = await launchBrowser({ profileDir, headless: false, chromiumPath });
  }
  const page = await context.newPage();
  await openPageAndInject(page);
  if (!(await ensureLoggedIn(page))) {
    if (ownsBrowser) await context.close(); else await page.close();
    return;
  }

  for (const t of typesToRun(typeArg)) {
    log(`=== Scanning ${t} ===`);
    const tab = t === "comments" ? "comments/" : "reactions/";
    await page.goto(baseUrlForTab(page), { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    if (!(await ensureLoggedIn(page))) {
      if (ownsBrowser) await context.close(); else await page.close();
      return;
    }
    const keys = await page.evaluate(() => window.LP.collectKeys());
    const out = path.join(dataDir, `scan-${t}.json`);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ type: t, count: keys.length, keys, scannedAt: new Date().toISOString() }, null, 2));
    log(`${t}: ${keys.length} items found -> ${out}`);
  }
  if (ownsBrowser) await context.close(); else await page.close();
}

function baseUrlForTab(page) {
  const meUrl = page.url();
  const match = meUrl.match(/linkedin\.com\/in\/([^/]+)/);
  const user = match ? match[1] : "me";
  return `https://www.linkedin.com/in/${user}/recent-activity/${page.url().includes("comments/") ? "comments/" : "reactions/"}`;
}

async function runStatus() {
  for (const t of typesToRun(typeArg)) {
    const cp = loadCheckpoint(dataDir, t);
    log(`${t}: ${cp.processed.size} processed`);
  }
}

async function runCopyChromiumProfile() {
  const src = getFlag("source", "E:/wintools/PortableApps/chromium-win64/profile");
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
  --data-dir <dir>            default data
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