// CLI status command
import path from "node:path";
import { loadCheckpoint } from "../checkpoint.js";
import { log } from "../logger.js";
import { resolveFlag } from "./config.js";

export async function runStatus(args) {
  const dataDir = path.resolve(resolveFlag(args, "data-dir", "paths.dataDir", "data"));
  const typeArg = getFlag(args, "type", "all");

  function typesToRun(type) {
    if (type === "all") return ["comments", "likes"];
    if (type === "comments" || type === "likes") return [type];
    throw new Error(`Unknown type: ${type}`);
  }

  for (const t of typesToRun(typeArg)) {
    const cp = loadCheckpoint(dataDir, t);
    log(`${t}: ${cp.processed.size} processed`);
  }
}

function getFlag(args, name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  const v = args[idx + 1];
  if (v === undefined || v.startsWith("--")) return true;
  return v;
}