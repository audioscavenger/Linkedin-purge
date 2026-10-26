// CLI login command
import readline from "node:readline";
import path from "node:path";
import { launchBrowser, injectDomHelpers } from "../browser.js";
import { log } from "../logger.js";
import { resolveFlag } from "./config.js";

export async function runLogin(args) {
  const profileDir = resolveFlag(args, "profile-dir", "paths.profileDir", ".profile-chromium");
  // Login must be headed so the user can actually interact with the login form.
  const context = await launchBrowser({ profileDir, headless: false });
  const page = await context.newPage();
  const linkedinDomPath = path.resolve("./src/linkedin-dom.js");
  await injectDomHelpers(page, linkedinDomPath);
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
