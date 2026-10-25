import fs from "node:fs";
import path from "node:path";

export function checkpointPath(dataDir, type) {
  return path.join(dataDir, `checkpoint-${type}.json`);
}

export function loadCheckpoint(dataDir, type) {
  const p = checkpointPath(dataDir, type);
  try {
    const raw = fs.readFileSync(p, "utf8");
    const obj = JSON.parse(raw);
    return { processed: new Set(obj.processed || []), file: p };
  } catch {
    return { processed: new Set(), file: p };
  }
}

export function saveCheckpoint(dataDir, type, processedSet) {
  const p = checkpointPath(dataDir, type);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ processed: [...processedSet], savedAt: new Date().toISOString() }, null, 2));
}

export function resetCheckpoint(dataDir, type) {
  const p = checkpointPath(dataDir, type);
  try { fs.unlinkSync(p); } catch {}
}