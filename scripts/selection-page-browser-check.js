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
  - Ticking a row shows 1 selected with master indeterminate
  - Master selects exactly the filtered rows (3, then 1 under filter, then deselects only those)

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

    // 6. Selection counts. Initially nothing ticked.
    const initialSelected = await page.evaluate(() => document.getElementById("selected-count").textContent);
    if (initialSelected !== "0") {
      err(`FAIL: assertion selected-initial - expected "0" selected, observed "${initialSelected}"`);
      return false;
    }
    // Tick the first visible row checkbox -> 1 selected, master indeterminate.
    await page.click("table#selection-table tbody tr:nth-child(1) .row-select");
    const oneSelected = await page.evaluate(() => ({ n: document.getElementById("selected-count").textContent, master: document.getElementById("master-select").indeterminate, checked: document.getElementById("master-select").checked }));
    if (oneSelected.n !== "1" || !oneSelected.master || oneSelected.checked) {
      err(`FAIL: assertion select-one - expected 1 selected with master indeterminate, observed count=${oneSelected.n} indeterminate=${oneSelected.master} checked=${oneSelected.checked}`);
      return false;
    }
    // Master selects exactly the filtered rows: with all rows visible, all 3.
    await page.click("#master-select");
    const allSelected = await page.evaluate(() => ({ n: document.getElementById("selected-count").textContent, checked: document.getElementById("master-select").checked, indet: document.getElementById("master-select").indeterminate }));
    if (allSelected.n !== "3" || !allSelected.checked || allSelected.indet) {
      err(`FAIL: assertion select-all-visible - expected 3 selected and master checked, observed count=${allSelected.n} checked=${allSelected.checked} indeterminate=${allSelected.indet}`);
      return false;
    }
    // Filter to LOVE only: exactly one row visible, selection preserved (3), master checked (all visible selected).
    await page.click('.state-filter[value="LIKE"]');
    const filteredSelected = await page.evaluate(() => ({ n: document.getElementById("selected-count").textContent, visible: [...document.querySelectorAll("#selection-table tbody tr")].filter((r) => r.style.display !== "none").length, master: document.getElementById("master-select").checked }));
    if (filteredSelected.n !== "3" || filteredSelected.visible !== 1 || !filteredSelected.master) {
      err(`FAIL: assertion selection-preserved-under-filter - expected 3 selected over 1 visible row with master checked, observed ${JSON.stringify(filteredSelected)}`);
      return false;
    }
    // Untick master under the filter: deselects exactly the filtered (LOVE) row.
    await page.click("#master-select");
    const deselected = await page.evaluate(() => ({ n: document.getElementById("selected-count").textContent, master: document.getElementById("master-select").checked, indet: document.getElementById("master-select").indeterminate }));
    if (deselected.n !== "2" || deselected.master || deselected.indet) {
      err(`FAIL: assertion deselect-filtered - expected 2 selected, master unchecked, observed ${JSON.stringify(deselected)}`);
      return false;
    }
    // Restore the filter for any later checks.
    await page.click('.state-filter[value="LIKE"]');

    log("PASS: selection page browser check - row count, first row, filters, empty state, sorted order and master-select counts verified");
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
