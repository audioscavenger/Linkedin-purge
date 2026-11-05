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
// generates a fixture page on the fly, and asserts row count, a sample
// cell, the filter behavior and a sorted order. Exits non-zero with a
// named failure otherwise.

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
  - Row count matches the fixture (3 rows)
  - First row state cell is "LIKE" and author cell is "Ada"
  - Unchecking the LIKE filter leaves one visible row (LOVE)
  - Sorting by author puts Ada first, toggling direction puts Cy first
  - Author filter matching nothing shows the empty state and 0 rows

Exits 0 on pass, 1 on a named failure (assertion name, expectation, observed).

This check stays out of npm run check / npm run health because it needs a browser.`);
}

async function assertPage() {
  const env = {
    type: "likes",
    items: [
      { key: "reaction:1", cardId: "card-secret-1", state: "LIKE", author: "Ada", dateTime: "Sep 16", text: null, postExcerpt: "first excerpt", postHref: "/feed/update/1", status: "no-op" },
      { key: "reaction:2", cardId: "card-secret-2", state: "LOVE", author: "Bo", dateTime: "Sep 17", text: null, postExcerpt: "second excerpt", postHref: null, status: "pending" },
      { key: "reaction:3", cardId: "card-secret-3", state: "LIKE", author: "Cy", dateTime: "Sep 18", text: null, postExcerpt: "third excerpt", postHref: null, status: "no-op" },
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

    const cellText = (selector) => page.evaluate((s) => document.querySelector(s).textContent, selector);
    const visibleRows = () => page.evaluate(() => [...document.querySelectorAll("#selection-table tbody tr")].filter((r) => r.style.display !== "none").length);
    const readRows = () => page.evaluate(() => [...document.querySelectorAll("#selection-table tbody tr")].map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent)));

    // 1. Full row count.
    const rowCount = await visibleRows();
    if (rowCount !== 3) {
      err(`FAIL: assertion row-count - expected 3 rows, observed ${rowCount} rows`);
      return false;
    }

    // 2. First row renders from the embedded data.
    const firstRowCells = (await readRows())[0] || [];
    if (firstRowCells[1] !== "LIKE" || firstRowCells[2] !== "Ada") {
      err(`FAIL: assertion first-row - expected state "LIKE" and author "Ada", observed state "${firstRowCells[1]}" author "${firstRowCells[2]}"`);
      return false;
    }

    // 3. Uncheck LIKE -> only LOVE/Bo remains visible.
    await page.click('.state-filter[value="LIKE"]');
    const filtered = await visibleRows();
    if (filtered !== 1) {
      err(`FAIL: assertion filter-state - expected 1 visible row with LIKE unchecked, observed ${filtered}`);
      return false;
    }
    // Re-check LIKE.
    await page.click('.state-filter[value="LIKE"]');
    const restored = await visibleRows();
    if (restored !== 3) {
      err(`FAIL: assertion filter-state-restore - expected 3 visible rows after re-checking LIKE, observed ${restored}`);
      return false;
    }

    // 4. Sort by author ascending: Ada, Bo, Cy.
    await page.selectOption("#sort-by", "author");
    const sorted = await readRows();
    const byAuthor = sorted.map((r) => r[2]).join(",");
    if (byAuthor !== "Ada,Bo,Cy") {
      err(`FAIL: assertion sort-author - expected "Ada,Bo,Cy", observed "${byAuthor}"`);
      return false;
    }
    // Toggle direction: Cy, Bo, Ada.
    await page.click("#sort-dir");
    const sortedDesc = (await readRows()).map((r) => r[2]).join(",");
    if (sortedDesc !== "Cy,Bo,Ada") {
      err(`FAIL: assertion sort-author-desc - expected "Cy,Bo,Ada", observed "${sortedDesc}"`);
      return false;
    }
    await page.selectOption("#sort-by", "");
    await page.click("#sort-dir");

    // 5. Author filter matching nothing: empty state shown, 0 rows visible.
    await page.fill("#filter-author", "zzz-no-such-author");
    const emptyVisible = await visibleRows();
    const emptyHidden = await page.evaluate(() => document.getElementById("empty-state").hidden);
    if (emptyVisible !== 0 || emptyHidden !== false) {
      err(`FAIL: assertion empty-state - expected 0 rows visible with the empty state shown, observed ${emptyVisible} rows visible, hidden=${emptyHidden}`);
      return false;
    }
    await page.fill("#filter-author", "");

    log("PASS: selection page browser check - row count, first row, filters, empty state and sorted order verified");
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
