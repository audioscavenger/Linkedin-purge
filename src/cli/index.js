// Main CLI entry point - delegates to per-command modules
import { err } from "../logger.js";

import { runLogin } from "./login.js";
import { runCopyChromiumProfile } from "./copy-chromium-profile.js";
import { runScan } from "./scan.js";
import { runPurge } from "./purge.js";
import { runStatus } from "./status.js";

export async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  try {
    if (command === "login") await runLogin(args);
    else if (command === "copy-chromium-profile") await runCopyChromiumProfile(args);
    else if (command === "scan") await runScan(args);
    else if (command === "purge") await runPurge(args);
    else if (command === "status") await runStatus(args);
    else printHelp();
  } catch (e) {
    err(e && e.stack ? e.stack : String(e));
    process.exit(1);
  }
}

function printHelp() {
  console.log(`linkedin-purge

Commands:
  login            Open a headed browser to log in; saves profile.
  copy-chromium-profile  Copy the chrlauncher Chromium profile into .profile-chromium.
  scan             Collect item counts (dry-run) for --type.
  purge            Scan, confirm, then delete with pacing.
  status           Show checkpoint progress.

Flags:
  --type comments|likes|all   (default all)
  --profile-dir <dir>         (default: .profile-chromium, then chrlauncher profile, then .profile)
  --data-dir <dir>            default data
  --chromium-path <path>      (default auto-detect portable Chromium)
  --cdp <endpoint>            Attach to a running Chromium via CDP (e.g. http://localhost:9222)
  --limit <n>                 Stop after deleting n items (0 = unlimited)
  --headless                  run browser headless
  --action-min/--action-max   per-action delay ms (default 2000/5000)
  --batch-min/--batch-max     per-10 batch pause ms (default 30000/60000)
  --reset-checkpoint          delete checkpoint before run (purge only)
`);
}
