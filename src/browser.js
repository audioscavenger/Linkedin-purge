import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { warn } from "./logger.js";
import {
  isProfileLockFailure,
  classifyHolders,
  pickRecovery,
  ProfileInUseError,
} from "./browser-recovery.js";

// Chromium + stealth
import { chromium as baseChromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
baseChromium.use(stealth());

// Core playwright for CDP attach (no stealth needed).
import { chromium as coreChromium } from "playwright";

export function findChromiumBinary() {
  const candidates = [
    "E:/wintools/PortableApps/chromium-win64/bin/chrome.exe",
    "C:/Program Files/Chromium/Application/chrome.exe",
    "C:/Program Files (x86)/Chromium/Application/chrome.exe",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export async function launchBrowser({ profileDir, headless = false, chromiumPath }) {
  fs.mkdirSync(profileDir, { recursive: true });
  const exe = chromiumPath || findChromiumBinary();
  const opts = {
    headless,
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    timezoneId: "America/New_York",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--blink-settings=imagesEnabled=false",
      "--disable-remote-fonts",
    ],
  };
  if (exe) opts.executablePath = exe;

  try {
    return await baseChromium.launchPersistentContext(profileDir, opts);
  } catch (error) {
    // Only profile-lock failures are handled here; anything else keeps its
    // full diagnostics so a different kind of breakage stays visible.
    if (!isProfileLockFailure(error)) throw error;
    return launchAfterRecovery({ profileDir, opts, exe });
  }
}

// The recovery path. Reads only through the pure helpers in
// browser-recovery.js (which the unit tests pin); the IO below is
// Windows-specific and degrades to "no holders found" when it cannot run.
async function launchAfterRecovery({ profileDir, opts, exe }) {
  const holders = classifyHolders(listChromeProcesses(), profileDir);
  const recovery = pickRecovery(holders);

  if (recovery.action === "ask-user-close") {
    throw new ProfileInUseError(
      `A browser window (PID ${recovery.pids.join(", ")}) is already using the profile ${profileDir}. ` +
        `Close that browser and re-run the same command.`
    );
  }

  let killedPids = [];
  if (recovery.pids.length) {
    // A previous run of this tool left a headless/CDP instance holding the
    // profile lock: kill it, give it a beat to release, then try again.
    warn(`Leftover browser process holding the profile (PID ${recovery.pids.join(", ")}) -- killing it and retrying the launch.`);
    killProcesses(recovery.pids);
    killedPids = recovery.pids;
  } else {
    // Nothing live holds the profile: a stale lock file from a crashed or
    // force-closed run is the usual suspect.
    warn("No live browser holds the profile; clearing stale lock files and retrying the launch.");
    removeStaleLockFiles(profileDir);
  }
  await wait(killedPids.length ? 750 : 300);

  try {
    return await baseChromium.launchPersistentContext(profileDir, opts);
  } catch (retryError) {
    // The retry failed: re-scan for whoever still holds the profile so the
    // message can name them (typically a browser window the user has open),
    // and keep the first line of the underlying error as the diagnosis.
    const stillHolding = classifyHolders(listChromeProcesses(), profileDir);
    throw new ProfileInUseError(
      finalFailureMessage({
        killedPids,
        interactivePids: stillHolding.interactive.map((row) => row.pid),
        originalError: retryError,
        profileDir,
      })
    );
  }
}

// --- IO helpers (Windows; each degrades to "nothing found" on failure) ---

// List every chrome-family process with its command line, so the pure
// classifyHolders() can decide which of them hold our profile. This is a
// Windows tool, so a PowerShell query is the right level of plumbing here;
// if it cannot run (other OS, restricted shell) we simply see no holders and
// fall through to the stale-lock-file path.
function listChromeProcesses() {
  const query =
    "Get-CimInstance Win32_Process | " +
    "Where-Object { $_.Name -like 'chrome*' } | " +
    "Select-Object -Property ProcessId,CommandLine | ConvertTo-Json -Compress";
  let raw = "";
  try {
    raw = execSync(`powershell -NoProfile -Command "${query}"`, {
      encoding: "utf8",
      timeout: 10000,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return [];
  }
  try {
    const parsed = JSON.parse(raw.trim() || "null");
    const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return rows
      .filter((row) => row && row.ProcessId)
      .map((row) => ({ pid: row.ProcessId, commandLine: row.CommandLine || "" }));
  } catch {
    return [];
  }
}

// Force-kill by PID (with its child tree). Called only on stragglers the
// pure helpers classified as ours; failures are logged, not thrown -- the
// retry below is the real check that the lock is released. Killing the root
// PID with /F takes the whole tree down, so "process not found" on a
// sibling is success, not an error.
function killProcesses(pids) {
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${Number(pid)} /T /F`, {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const detail = String(error && (error.stderr || error.message) || error);
      if (/not found/i.test(detail)) continue;
      const line = detail.split("\n").map((s) => s.trim()).find(Boolean);
      warn(`Could not kill PID ${pid} (${line || "unknown error"}).`);
    }
  }
}

// The lock artifacts chromium leaves in the profile root. Only meaningful to
// remove when no live process holds the profile -- the caller guarantees that.
function removeStaleLockFiles(profileDir) {
  for (const name of ["lockfile", "SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    try {
      fs.rmSync(path.join(profileDir, name), { force: true });
    } catch {
      // Absent or locked: nothing more to do; the retry will tell the truth.
    }
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectCDP(endpoint) {
  const browser = await coreChromium.connectOverCDP(endpoint);
  const contexts = browser.contexts();
  const context = contexts.length ? contexts[0] : await browser.newContext();
  return { browser, context };
}

export async function injectDomHelpers(page, helperPath) {
  const fsMod = await import("node:fs");
  const code = fsMod.readFileSync(helperPath, "utf8");
  await page.addInitScript(code);
}

export async function blockHeavyResources(page) {
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (type === "image" || type === "media" || type === "font") {
      route.abort();
    } else {
      route.continue();
    }
  });
}
