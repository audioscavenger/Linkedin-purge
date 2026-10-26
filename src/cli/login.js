// CLI login command
import readline from "node:readline";
import { launchBrowser, injectDomHelpers } from "../browser.js";
import { log } from "../logger.js";

export async function runLogin(args) {
  const profileDir = getFlag(args, "profile-dir", ".profile-chromium");
  const context = await launchBrowser({ profileDir, headless: false });
  const page = await context.newPage();
  await injectDomHelpers(page, "./linkedin-dom.js");
  await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
  log("Browser opened. Log in to LinkedIn, then press Enter here to save and close.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => {
    rl.question("Press Enter when logged in... ", () => {
      rl.close();
      resolve();
    });
  });
  await context.close();
  log("Profile saved to " + profileDir);
}

function getFlag(args, name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  const v = args[idx + 1];
  if (v === undefined || v.startsWith("--")) return true;
  return v;
}