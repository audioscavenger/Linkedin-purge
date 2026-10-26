// Unit tests for the launch-recovery decision helpers in src/browser-recovery.js.
//
// Only the pure decision surface is tested here: is this error a
// profile-lock failure, does this process hold this profile, which holders
// are stragglers vs. interactive browsers, and which recovery action follows.
// The IO path (PowerShell listing, taskkill, lock-file clearing) lives in
// src/browser.js and degrades to "no holders found" when it cannot run.

import {
  isProfileLockFailure,
  matchesProfile,
  classifyHolders,
  pickRecovery,
  ProfileInUseError,
} from "../src/browser-recovery.js";

const PROFILE = "E:/wintools/PortableApps/chromium-win64/profile";

// The exact signature Playwright reports when the launched chrome.exe exits
// because the profile was already locked (exitCode=21).
function testIsProfileLockFailureSignatures() {
  const realError = new Error(
    "browserType.launchPersistentContext: Target page, context or browser has been closed\n" +
      "Browser logs:\n<launched>\n  - [pid=12704] <process did exit: exitCode=21, signal=null>"
  );
  if (!isProfileLockFailure(realError)) throw new Error("closed-on-launch signature not detected");
  if (!isProfileLockFailure(new Error("some wrapper: exitCode=21 in call log"))) throw new Error("exitCode=21 not detected");
  if (isProfileLockFailure(new Error("ENOENT: no such file or directory, launching chrome.exe"))) {
    throw new Error("unrelated launch error must NOT be classified as a profile lock");
  }
  if (
    isProfileLockFailure(undefined) ||
    isProfileLockFailure(null) ||
    isProfileLockFailure("plain string error")
  ) {
    throw new Error("malformed errors must not classify as profile locks");
  }
}

function testMatchesProfilePathForms() {
  // As it actually appears in a tasklist line (forward slashes, our casing).
  const forward = `--user-data-dir=E:/wintools/PortableApps/chromium-win64/profile --headless`;
  // Windows may render the same path backslashed and case-mixed.
  const backslashed = `chrome.exe --user-data-dir=E:\\WINTOOLS\\PortableApps\\Chromium-Win64\\PROFILE --no-sandbox`;
  if (!matchesProfile(forward, PROFILE)) throw new Error("forward-slash form must match");
  if (!matchesProfile(backslashed, PROFILE)) throw new Error("backslash/case variant must match");
  if (matchesProfile("--user-data-dir=C:/other/profile", PROFILE)) throw new Error("a different profile must not match");
  if (matchesProfile(null, PROFILE) || matchesProfile("", PROFILE) || matchesProfile(forward, null)) {
    throw new Error("missing arguments must not match");
  }
}

function testClassifyHoldersStragglersAndInteractive() {
  const rows = [
    { pid: 12704, commandLine: `chrome.exe --headless --user-data-dir=${PROFILE}` },
    { pid: 55, commandLine: `chrome.exe --user-data-dir=${PROFILE}` },
    { pid: 9999, commandLine: `chrome.exe --user-data-dir=C:/unrelated/profile --headless` },
  ];
  const { stragglers, interactive } = classifyHolders(rows, PROFILE);
  if (stragglers.length !== 1 || stragglers[0].pid !== 12704) throw new Error("headless holder must be a straggler");
  if (interactive.length !== 1 || interactive[0].pid !== 55) throw new Error("bare holder must be interactive");
  if (stragglers.some((row) => row.pid === 9999) || interactive.some((row) => row.pid === 9999)) {
    throw new Error("a process of another profile must not appear in either list");
  }
}

function testClassifyHoldersEmptyInputs() {
  const { stragglers, interactive } = classifyHolders(null, PROFILE);
  if (stragglers.length !== 0 || interactive.length !== 0) throw new Error("null rows must yield no holders");
}

function testPickRecoveryActions() {
  const kill = pickRecovery({
    stragglers: [{ pid: 12704 }],
    interactive: [{ pid: 55 }],
  });
  if (kill.action !== "kill-and-retry" || kill.pids.join(",") !== "12704") {
    throw new Error("stragglers must be killed first, with their PIDs");
  }

  const ask = pickRecovery({
    stragglers: [],
    interactive: [{ pid: 55 }],
  });
  if (ask.action !== "ask-user-close" || ask.pids.join(",") !== "55") {
    throw new Error("an interactive browser must be reported to the user, never killed");
  }

  const retry = pickRecovery({});
  if (retry.action !== "retry" || retry.pids.length !== 0) {
    throw new Error("no live holder must fall through to the stale-lock retry");
  }
}

function testProfileInUseErrorIsFriendly() {
  const e = new ProfileInUseError("close the browser and re-run");
  if (e.friendly !== true) throw new Error("friendly flag must be set");
  if (e.message !== "close the browser and re-run") throw new Error("message must be preserved");
  if (!(e instanceof Error)) throw new Error("must remain catchable as an Error");
}

const tests = [
  testIsProfileLockFailureSignatures,
  testMatchesProfilePathForms,
  testClassifyHoldersStragglersAndInteractive,
  testClassifyHoldersEmptyInputs,
  testPickRecoveryActions,
  testProfileInUseErrorIsFriendly,
];

let failed = 0;
for (const fn of tests) {
  try {
    fn();
    console.log(`PASS: ${fn.name}`);
  } catch (e) {
    console.error(`FAIL: ${fn.name} - ${e.message}`);
    failed++;
  }
}
const passed = tests.length - failed;
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
