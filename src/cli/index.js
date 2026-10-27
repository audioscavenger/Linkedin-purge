// Main CLI entry point - delegates to per-command modules
import { err } from "../logger.js";

import { runLogin } from "./login.js";
import { runCopyChromiumProfile } from "./copy-chromium-profile.js";
import { runScan } from "./scan.js";
import { runPurge } from "./purge.js";
import { runStatus } from "./status.js";

const KNOWN_COMMANDS = new Set([
  "login",
  "copy-chromium-profile",
  "scan",
  "purge",
  "status",
]);

export async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  // --help / -h is honored from any position, for any command.
  if (hasHelpFlag(args) || command === "help") {
    printHelp(KNOWN_COMMANDS.has(command) ? command : null);
    return;
  }

  try {
    if (command === "login") await runLogin(args);
    else if (command === "copy-chromium-profile") await runCopyChromiumProfile(args);
    else if (command === "scan") await runScan(args);
    else if (command === "purge") await runPurge(args);
    else if (command === "status") await runStatus(args);
    else printHelp();
  } catch (e) {
    err(e && e.friendly ? e.message : (e && e.stack ? e.stack : String(e)));
    process.exit(1);
  }
}

function hasHelpFlag(args) {
  return args.includes("--help") || args.includes("-h");
}

function printHelp(command) {
  const focus = command ? `\nHelp for: ${command}\n` : "";
  console.log(`linkedin-purge
Purge your own LinkedIn comments and reactions (likes) via a real browser, with
randomized pacing, checkpointing, and dry-run confirmation.
${focus}
Usage:
  npm run <command> [--flags]        (inside the project)
  npx linkedin-purge <command> [--flags]

Commands:
  login                    Open a headed browser to log in; saves the profile.
  copy-chromium-profile    Copy the portable Chromium profile into .profile-chromium.
  scan                     Collect item counts for --type (dry-run, no deletion).
  purge                    Scan, confirm, then delete with pacing.
  status                   Show checkpoint progress.

Parameters:
  --type <comments|likes|all>     Item type to process                 (default: all)
  --deep                          Walk the whole activity list, not the first page (default: false, scan only)
  --profile-dir <dir>             Chromium profile directory
  --data-dir <dir>                Directory for reports/checkpoints    (default: data)
  --chromium-path <path>          Path to the Chromium binary
  --cdp <endpoint>                Attach to a running Chromium (e.g. http://localhost:9222)
  --limit <n>                     Stop after n deletions               (default: 0 = unlimited)
  --action-min <ms>               Min per-action delay                 (default: 2000)
  --action-max <ms>               Max per-action delay                 (default: 5000)
  --batch-min <ms>                Min batch pause                      (default: 30000)
  --batch-max <ms>                Max batch pause                      (default: 60000)
  --reset-checkpoint              Clear checkpoint before running      (purge only)
  --input <file>                  Only purge keys found in this JSON file (purge only)
  --headless                      Run the browser headless
  -h, --help                      Show this help (works with any command)

Examples:
  npm run scan -- --type comments              # dry-run: count your comments
  npm run purge                                # delete comments + reactions
  npm run purge -- --type likes --limit 25     # delete only 25 reactions
  npm run scan -- --cdp http://localhost:9222  # attach to a running Chromium
  npm run status                               # show checkpoint progress

Config:
  Defaults live in config.json (timing and paths). CLI parameters always override.
`);
}
