// browser-recovery.js -- the decision helpers for the launch-recovery path in
// src/browser.js.
//
// `launchPersistentContext` fails with a browser-internal error when the
// profile is already locked (chrome.exe exits with code 21, "profile in use"),
// and Playwright wraps that failure as a multi-kilobyte error whose message
// carries the entire launch log + Call log. Throwing that at the user is the
// friction this module removes: classify the failure, decide what to do about
// the lock holder, and phrase the outcome in one human line.
//
// The pure decision functions live here (unit-tested in
// tests/browser-recovery.test.js); the IO -- listing windows processes,
// killing them, clearing lock files -- lives in src/browser.js, which is
// covered behaviourally, not unit-tested.

// A launch error is a profile-lock failure when Playwright reports the
// launched browser as closed right after launch (the profile was taken from
// it), or when the launch log shows chrome exiting with code 21 (Windows
// "profile in use"), or the ProfileInUse wording outright. Everything else
// (missing executable, CDP failures, ...) is NOT a profile-lock failure and
// must keep its full diagnostics.
export function isProfileLockFailure(error) {
  const message = String(error && (error.message || error));
  return (
    /Target page, context or browser has been closed/.test(message) ||
    /exitCode=21/.test(message) ||
    /ProfileInUse|profile .{0,40} in use/i.test(message)
  );
}

// A chrome process "holds" the profile when its command line references the
// profile directory (chrome records it in --user-data-dir). The launcher may
// have passed forward-slash or backslash paths and Windows matches case
// insensitively, so both sides are normalized before the substring test.
export function matchesProfile(commandLine, profileDir) {
  if (!commandLine || !profileDir) return false;
  const normalize = (value) => String(value).toLowerCase().replace(/\\/g, "/");
  return normalize(commandLine).includes(normalize(profileDir));
}

// Split lock holders into the two kinds that need different handling:
//  - stragglers: automation instances this tool launched and left behind
//    (headless, or CDP-attached). Killing them is safe -- they belong to a
//    previous run, not to the user.
//  - interactive: a browser window without automation flags, most likely one
//    the user has open right now. Never force-kill user windows without
//    consent.
export function classifyHolders(rows, profileDir) {
  const stragglers = [];
  const interactive = [];
  for (const row of rows || []) {
    if (!matchesProfile(row && row.commandLine, profileDir)) continue;
    const automatic = /--headless|--remote-debugging-pipe|-automation/i.test(row.commandLine || "");
    (automatic ? stragglers : interactive).push(row);
  }
  return { stragglers, interactive };
}

// Choose the recovery action from the classified holders:
//  - kill-and-retry : kill the stragglers' PIDs, then re-attempt the launch
//  - ask-user-close : an interactive browser holds the lock; the user must
//    close it (report its PIDs so the message can name them)
//  - retry          : nothing live holds it; a stale lock file is the
//    suspect, so clear it and re-attempt
export function pickRecovery({ stragglers = [], interactive = [] } = {}) {
  if (stragglers.length) {
    return { action: "kill-and-retry", pids: stragglers.map((row) => row.pid) };
  }
  if (interactive.length) {
    return { action: "ask-user-close", pids: interactive.map((row) => row.pid) };
  }
  return { action: "retry", pids: [] };
}

// Friendly launch failures: cli/index.js reads this flag and prints only the
// message (no stack), so the user sees a one-line, actionable answer instead
// of the Playwright launch log + Call log + async stack trace.
export class ProfileInUseError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProfileInUseError";
    this.friendly = true;
  }
}
