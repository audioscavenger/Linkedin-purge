import fs from "node:fs";
import path from "node:path";

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
    args: ["--disable-blink-features=AutomationControlled"],
  };
  if (exe) opts.executablePath = exe;
  const context = await baseChromium.launchPersistentContext(profileDir, opts);
  return context;
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