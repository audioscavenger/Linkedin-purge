/*
  Command-level tests for the headless/headed resolution through the launch
  seam. Mirrors tests/browser-opener.test.js: stub setLaunchBrowserImpl, run the
  real command function, and assert the headless value it hands to launchBrowser.
  The config.json is controlled for the whole run so the "default" assertions
  are order-independent: a behavior.headed left behind by another test file must
  not flip the default cases.
*/
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  setLaunchBrowserImpl,
  resetLaunchBrowserImpl,
} from "../src/browser.js";
import { runScan } from "../src/cli/scan.js";
import { runPurge } from "../src/cli/purge.js";
import { runLogin } from "../src/cli/login.js";

const configPath = path.resolve(process.cwd(), "config.json");
const configExisted = fs.existsSync(configPath);
const configBackup = configExisted ? fs.readFileSync(configPath, "utf8") : null;

// Stub the launch, capture the opts the command hands to it, and abort before
// anything else touches the browser (the launch line is the first such touch).
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

try {
  // A clean config (behavior present but empty) yields the built-in default,
  // behavior.headed: false, so the "default" cases below are deterministic.
  fs.writeFileSync(
    configPath,
    JSON.stringify({ behavior: {} }, null, 2) + "\n"
  );

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
  assert.strictEqual(
    (await captureHeadless(runPurge, [])).headless,
    true,
    "purge default hands headless=true to launchBrowser (the deliberate flip)"
  );
  assert.strictEqual(
    (await captureHeadless(runPurge, ["--headed"])).headless,
    false,
    "purge --headed hands headless=false to launchBrowser"
  );
  assert.strictEqual(
    (await captureHeadless(runLogin, [])).headless,
    false,
    "login hands headless=false to launchBrowser (headed, no flag)"
  );
} finally {
  if (configExisted) fs.writeFileSync(configPath, configBackup);
  else if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
}

console.log("PASS: command-level headless launch values");
