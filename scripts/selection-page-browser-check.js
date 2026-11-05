// Selection page browser check harness.
// Opens a generated page in Playwright Chromium and asserts the table
// renders from the embedded data. NOT part of `npm run check` or
// `npm run health` (needs a browser). No login needed - unlike
// `npm run verify:page` which opens LinkedIn with your profile.
//
// Usage: node scripts/selection-page-browser-check.js [--help]
//   --help  show this help and exit
//
// Safety: launches Chromium headless via this repo's browser module,
// generates a fixture page on the fly, and asserts row count + a sample
// cell. Exits non-zero with a named failure otherwise.

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { launchBrowser } from "../src/browser.js";
import { log, err } from "../src/logger.js";
import { generateSelectionPage } from "../src/selection-page.js";

function showHelp() {
  log(`selection-page-browser-check - open a generated selection page in Chromium and assert the table renders.

No login needed (this is not verify:page - it does not open LinkedIn).

Assertions:
  - Row count matches the fixture (2 rows)
  - First row state cell is "LIKE" and author cell is "Ada"

Exits 0 on pass, 1 on a named failure (assertion name, expectation, observed).

This check stays out of npm run check / npm run health because it needs a browser.`);
}

async function assertPage() {
  const env = {
    type: "likes",
    items: [
      {
        key: "reaction:1",
        cardId: "card-secret-1",
        state: "LIKE",
        author: "Ada",
        dateTime: "Sep 16",
        text: null,
        postExcerpt: "first excerpt",
        postHref: "/feed/update/1",
        status: "no-op",
      },
      {
        key: "reaction:2",
        cardId: "card-secret-2",
        state: "LOVE",
        author: "Bo",
        dateTime: "Sep 17",
        text: null,
        postExcerpt: "second excerpt",
        postHref: null,
        status: "pending",
      },
    ],
  };

  const html = generateSelectionPage(env);
  const tmpPath = path.join(os.tmpdir(), "selection-page-check.html");
  fs.writeFileSync(tmpPath, html);

  const profileDir = path.join(os.tmpdir(), "selection-page-check-profile");
  const browser = await launchBrowser({ profileDir, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`file://${tmpPath}`);
    await page.waitForSelector("table#selection-table", { state: "attached" });

    const rowCount = await page.evaluate(() => document.querySelectorAll("table#selection-table tbody tr").length);
    if (rowCount !== 2) {
      err(`FAIL: assertion row-count - expected 2 rows, observed ${rowCount} rows`);
      return false;
    }

    const firstRowCells = await page.evaluate(() => {
      const row = document.querySelector("table#selection-table tbody tr");
      return row ? [...row.querySelectorAll("td")].map((td) => td.textContent) : [];
    });
    const state = firstRowCells[1] ?? "";
    const author = firstRowCells[2] ?? "";
    if (state !== "LIKE") {
      err(`FAIL: assertion first-row state - expected "LIKE", observed "${state}"`);
      return false;
    }
    if (author !== "Ada") {
      err(`FAIL: assertion first-row author - expected "Ada", observed "${author}"`);
      return false;
    }
    log("PASS: selection page browser check - row count (2) and first row (LIKE / Ada) verified");
    return true;
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    return;
  }
  const ok = await assertPage();
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  err(`ERROR: ${error && error.message ? error.message : error}`);
  process.exitCode = 1;
});
