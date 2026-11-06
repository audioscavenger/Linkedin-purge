// CLI status command
import path from "node:path";
import { EnvelopeStore } from "../envelope-store.js";
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

  const results = [];
  for (const t of typesToRun(typeArg)) {
    const store = new EnvelopeStore(dataDir, t);
    await store.load();
    if (!store.envelope || !Array.isArray(store.envelope.items)) {
      log(`${t}: no scan yet`);
      results.push({ type: t, hasEnvelope: false, counts: null });
      continue;
    }
    const counts = await store.counts();
    log(
      `${t}: ${counts.deleted} deleted, ${counts.failed} failed, ` +
        `${counts["not-found"]} not found, ${counts.todo} todo, ` +
        `${counts["no-op"]} no-op`
    );
    log(
      `${t}: deleted=${counts.deleted} failed=${counts.failed} ` +
        `not-found=${counts["not-found"]} todo=${counts.todo} ` +
        `no-op=${counts["no-op"]}`
    );
    results.push({ type: t, hasEnvelope: true, counts });
  }
  return results;
}

function getFlag(args, name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  const v = args[idx + 1];
  if (v === undefined || v.startsWith("--")) return true;
  return v;
}
