/*
  Default-browser opener module - injectable for testing.
  Opens a page in the OS default browser with graceful failure handling.

  The scan command writes each scan's selection page to data/selection-<type>.html
  and opens it with this module so the user can review before purging. Opening
  is best effort: a failure prints the path and never fails the scan. The
  opener is injectable (setOpenPage) so unit tests cover the success and
  failure paths without touching any real browser.
*/

import { execFile } from "node:child_process";
import path from "node:path";
import { log, warn } from "./logger.js";

// The opener implementation is swappable so unit tests can inject stubs.
let openerFn = defaultOpenPage;

/**
 * Inject a custom opener implementation (used by unit tests).
 */
export function setOpenPage(fn) {
  openerFn = fn;
}

/**
 * Reset the opener back to the default implementation.
 */
export function resetOpenPage() {
  openerFn = defaultOpenPage;
}

/**
 * Open a page in the OS default browser.
 * Best effort: never throws, returns true on success and false on failure.
 */
export async function openPage(pagePath) {
  try {
    await openerFn(pagePath);
    log(`Opened selection page: ${pagePath}`);
    return true;
  } catch (error) {
    warn(`Failed to open selection page: ${pagePath}`);
    warn(`Open it manually: ${pagePath}`);
    return false;
  }
}

/**
 * Default implementation: spawn the OS default browser opener for a file.
 * macOS -> open, Linux -> xdg-open, Windows -> cmd /c start (a builtin, not an
 * executable, so it needs the shell rather than a bare execFile call).
 */
function defaultOpenPage(pagePath) {
  const absPath = path.resolve(pagePath);
  const platform = process.platform;
  let file;
  let args;
  if (platform === "darwin") {
    file = "open";
    args = [absPath];
  } else if (platform === "win32") {
    file = process.env.ComSpec || "cmd.exe";
    args = ["/c", "start", "", absPath];
  } else {
    file = "xdg-open";
    args = [absPath];
  }
  return new Promise((resolve, reject) => {
    execFile(file, args, (error) => (error ? reject(error) : resolve()));
  });
}
