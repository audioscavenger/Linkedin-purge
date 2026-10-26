// CLI copy-chromium-profile command
import fs from "node:fs";
import path from "node:path";
import { log, err } from "../logger.js";
import { resolveFlag } from "./config.js";

export async function runCopyChromiumProfile(args) {
  const src = getFlag(args, "source", "E:/wintools/PortableApps/chromium-win64/profile");
  const dest = path.resolve(resolveFlag(args, "profile-dir", "paths.profileDir", ".profile-chromium"));
  log(`Source profile: ${src}`);
  log(`Destination: ${dest}`);
  if (!fs.existsSync(src)) {
    err("Source profile not found: " + src);
    process.exit(1);
  }
  if (fs.existsSync(dest)) {
    log("Removing existing destination...");
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.cpSync(src, dest, { recursive: true, force: true });
  } finally {
    try {
      for (const name of fs.readdirSync(dest)) {
        if (/lock/i.test(name)) {
          try { fs.rmSync(path.join(dest, name), { recursive: true, force: true }); } catch {}
        }
      }
    } catch {}
  }
  log("Copied. Run with --profile-dir " + dest);
}

function getFlag(args, name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  const v = args[idx + 1];
  if (v === undefined || v.startsWith("--")) return true;
  return v;
}