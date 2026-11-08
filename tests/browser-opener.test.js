/*
  Unit tests for the default-browser opener (src/browser-opener.js).
  The opener is injectable, so these tests never touch a real browser:
  they stub setOpenPage(...) with scripted success/failure and assert how
  openPage reports it. The default implementation is not exercised here
  (it would spawn the OS browser); it is a thin exec wrapper.
*/
import process from "node:process";
import { setOpenPage, resetOpenPage, openPage } from "../src/browser-opener.js";

// No logging noise from the test: silence log/warn by intercepting console.
const originalLog = console.log;
const originalWarn = console.warn;
function silenceConsole() {
  console.log = (...args) => {
    originalLog.call(console, "[opener-test-muted]", ...args);
  };
  console.warn = (...args) => {
    originalWarn.call(console, "[opener-test-muted]", ...args);
  };
}
function restoreConsole() {
  console.log = originalLog;
  console.warn = originalWarn;
}

// Success path: the injected opener resolves, openPage reports success.
async function testOpenSuccess() {
  silenceConsole();
  let calledWith = null;
  setOpenPage(async (p) => {
    calledWith = p;
  });
  try {
    const ok = await openPage("data/selection-likes.html");
    if (ok !== true) throw new Error(`expected true on success, got ${ok}`);
    if (calledWith !== "data/selection-likes.html")
      throw new Error(`opener was called with ${calledWith}`);
  } finally {
    resetOpenPage();
    restoreConsole();
  }
  console.log(
    "PASS: injectable opener success returns true and receives the path"
  );
}

// Failure path: the injected opener throws, openPage reports failure without
// throwing, so the scan can print the path and carry on.
async function testOpenFailureDoesNotThrow() {
  silenceConsole();
  setOpenPage(async () => {
    throw new Error("browser refused to open");
  });
  try {
    const ok = await openPage("data/selection-likes.html");
    if (ok !== false) throw new Error(`expected false on failure, got ${ok}`);
  } finally {
    resetOpenPage();
    restoreConsole();
  }
  console.log(
    "PASS: injectable opener failure returns false instead of throwing"
  );
}

const tests = [testOpenSuccess, testOpenFailureDoesNotThrow];

async function main() {
  let failed = 0;
  for (const fn of tests) {
    try {
      await fn();
    } catch (e) {
      failLogger(`FAIL: ${fn.name} - ${e.message}`);
      failed++;
    }
  }
  const passed = tests.length - failed;
  originalLog(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

// Keep this in a separate fn so the muted console.log does not swallow failures.
function failLogger(msg) {
  originalWarn(msg);
}

main();
