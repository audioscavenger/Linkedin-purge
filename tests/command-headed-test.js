// Command-level tests for headless/headed resolution through the launch seam.
// Mirrors tests/browser-opener.test.js: stub setLaunchBrowserImpl, run the real
// command function, assert the headless value the command hands to launchBrowser.
import assert from "node:assert";
import { setLaunchBrowserImpl, resetLaunchBrowserImpl } from "../src/browser.js";
import { runScan } from "../src/cli/scan.js";
import { runPurge } from "../src/cli/purge.js";
import { runLogin } from "../src/cli/login.js";

// Run a command with a stubbed launchBrowser that captures the opts and aborts
// before anything else touches the browser.
async function captureHeadless(runFn, args) {
  let captured = null;
  setLaunchBrowserImpl(async (opts) => {
    captured = opts;
    throw new Error("test abort");
  });
  try {
    await runFn(args);
  } catch (e) {
    // Expected: the stub aborts at the launch line.
  }
  resetLaunchBrowserImpl();
  return captured;
}

// scan: headless by default (default=true), --headed yields headed (false).
assert.strictEqual(
  (await captureHeadless(runScan, [])).headless,
  true,
  "scan default hands headless=true to launchBrowser"
);
assert.strictEqual(
  (await captureHeadless(runScan, ["--headed"])).headless,
  false,
  "scan --headed hands headless=false to launchBrowser"
);

// purge: headless by default (the deliberate flip; default=true), --headed yields headed (false).
assert.strictEqual(
  (await captureHeadless(runPurge, [])).headless,
  true,
  "purge default hands headless=true to launchBrowser"
);
assert.strictEqual(
  (await captureHeadless(runPurge, ["--headed"])).headless,
  false,
  "purge --headed hands headless=false to launchBrowser"
);

// login: stays headed (headless=false), no flag involved.
assert.strictEqual(
  (await captureHeadless(runLogin, [])).headless,
  false,
  "login hands headless=false to launchBrowser"
);

console.log("PASS: command-level headless launch values");