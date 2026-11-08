/*
  Envelope store: owns one scan envelope file on disk.
  The store is the single durability seam for per-item Purge Status: `mark`
  updates one item (matched by Card Identity) and writes the file atomically
  on the spot, so an interrupted run keeps every status earned so far and the
  caller cannot forget to save. Counts by status are exposed for the status
  command to reuse.
*/
import fs from "node:fs";
import path from "node:path";
import { PURGE_STATUSES } from "./purge/status.js";

export { PURGE_STATUSES };

const KNOWN_STATUSES = new Set(Object.values(PURGE_STATUSES));
const KNOWN_TYPES = new Set(["comments", "likes"]);

function isStatus(value) {
  return typeof value === "string" && KNOWN_STATUSES.has(value);
}

function isType(value) {
  return typeof value === "string" && KNOWN_TYPES.has(value);
}

// Named error thrown when `mark` is asked to update an identity that is not
// present in the envelope. It is never silently turned into a new item.
class EnvelopeStoreError extends Error {}

class UnknownCardIdentityError extends EnvelopeStoreError {
  constructor(identity, file) {
    super(
      `Unknown card identity in envelope store: ${identity}` +
        (file ? ` (no item with that cardId in ${file})` : "")
    );
    this.name = "UnknownCardIdentityError";
    this.code = "UNKNOWN_CARD_IDENTITY";
    this.identity = identity;
  }
}

function parseArgs(args) {
  let dataDir = null;
  let type = null;
  let file = null;
  let envelope = null;

  if (args.length === 0) return { dataDir, type, file, envelope };

  if (typeof args[0] === "string") {
    if (args.length === 1) {
      // A single string may be a file path or a directory.
      if (args[0].endsWith(".json")) file = args[0];
      else dataDir = args[0];
    } else if (args.length >= 2 && typeof args[1] === "string") {
      // (dataDir, type) OR (file-ish, type). Prefer directory+type.
      if (args[0].endsWith(".json")) {
        file = args[0];
        type = args[1];
      } else if (isType(args[1])) {
        dataDir = args[0];
        type = args[1];
      } else if (args[1].endsWith(".json")) {
        file = args[1];
        dataDir = args[0];
      } else {
        dataDir = args[0];
        type = args[1];
      }
    }
  } else if (args[0] && typeof args[0] === "object") {
    const o = args[0];
    dataDir = o.dataDir || o.dir || o.directory || o.root || null;
    type = o.type || o.kind || o.activityType || null;
    file = o.file || o.path || o.filePath || o.filename || null;
    envelope = o.envelope || o.data || null;
    if (!dataDir && o.store && typeof o.store === "object") {
      dataDir = o.store.dataDir || null;
      type = type || o.store.type || null;
      file = file || o.store.file || null;
    }
  }

  if (args.length >= 3 && typeof args[2] === "string") {
    if (isStatus(args[2])) {
      // ignore here; handled by mark parsing, not constructor
    } else if (isType(args[2])) {
      type = type || args[2];
    } else if (args[2].endsWith(".json")) {
      file = file || args[2];
    }
  }

  return { dataDir, type, file, envelope };
}

function resolveFile(dataDir, type, file) {
  if (file) return path.resolve(file);
  if (dataDir && type)
    return path.join(path.resolve(dataDir), `scan-${type}.json`);
  if (dataDir) {
    // Try to find a single scan-*.json in the directory.
    try {
      const entries = fs.readdirSync(path.resolve(dataDir));
      const scans = entries.filter((e) => /^scan-.+\.json$/.test(e));
      if (scans.length === 1) return path.join(path.resolve(dataDir), scans[0]);
    } catch {
      // ignore
    }
    return path.join(path.resolve(dataDir), "scan-envelope.json");
  }
  return null;
}

function normaliseMarkArgs(args) {
  let type = null;
  let identity = null;
  let status = null;

  if (args.length === 1 && args[0] && typeof args[0] === "object") {
    const o = args[0];
    type = o.type || o.kind || null;
    identity =
      o.cardId ||
      o.cardIdentity ||
      o.identity ||
      o.id ||
      o.key ||
      o.card ||
      null;
    status = o.status || o.value || o.state || o.mark || null;
    return { type, identity, status };
  }

  // Collect statuses and types by scanning args.
  const statuses = args.filter(isStatus);
  const types = args.filter(isType);
  const rest = args.filter((a) => !isStatus(a) && !isType(a));

  if (statuses.length > 0) status = statuses[0];
  if (types.length > 0) type = types[0];
  // identity is the first non-status, non-type string/object
  for (const a of rest) {
    if (identity === null) {
      if (typeof a === "string") identity = a;
      else if (a && typeof a === "object") {
        identity =
          a.cardId ||
          a.cardIdentity ||
          a.identity ||
          a.id ||
          a.key ||
          a.card ||
          null;
      }
    }
  }
  // If no explicit identity but a string remains, use it.
  if (identity === null && rest.length > 0 && typeof rest[0] === "string") {
    identity = rest[0];
  }

  return { type, identity, status };
}

class EnvelopeStore {
  constructor(...args) {
    if (!(this instanceof EnvelopeStore)) return new EnvelopeStore(...args);

    const parsed = parseArgs(args);
    this.dataDir = parsed.dataDir;
    this.type = parsed.type;
    this.file = resolveFile(parsed.dataDir, parsed.type, parsed.file);
    this.envelope = parsed.envelope || null;
    this.loaded = false;
    if (parsed.envelope) this.loaded = true;

    // If a single positional type was passed as second arg but file not resolved
    // because dataDir missing, keep type for later.
  }

  // ---- Prototype methods ----

  _resolveType = function (type) {
    return type || this.type || null;
  };

  _resolveFile = function (type) {
    const t = this._resolveType(type);
    if (this.file && !type) return this.file;
    if (this.dataDir && t)
      return path.join(path.resolve(this.dataDir), `scan-${t}.json`);
    if (this.file && t && this.type && t !== this.type) {
      // recompute from dataDir if possible
      if (this.dataDir)
        return path.join(path.resolve(this.dataDir), `scan-${t}.json`);
    }
    if (this.file) return this.file;
    return resolveFile(this.dataDir, t, null);
  };

  load = async function (type) {
    const t = this._resolveType(type);
    if (t) this.type = t;
    const file = this._resolveFile(t);
    if (file) this.file = file;

    if (!file) return null;
    let raw;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      this.envelope = null;
      this.loaded = true;
      return null;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      this.envelope = null;
      this.loaded = true;
      return null;
    }
    this.envelope = data;
    this.loaded = true;
    return data;
  };

  reload = function (type) {
    return this.load(type);
  };

  getEnvelope = function (type) {
    if (type && type !== this.type) {
      // best effort synchronous read
      const file = this._resolveFile(type);
      try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        return null;
      }
    }
    return this.envelope;
  };

  _ensureLoaded = async function (type) {
    const t = this._resolveType(type);
    if (!this.loaded || (t && t !== this.type)) {
      await this.load(t);
    }
    if (!this.envelope) {
      // try load again (may be null)
      await this.load(t);
    }
  };

  _findItemIndex = function (envelope, identity) {
    if (!envelope || !Array.isArray(envelope.items)) return -1;
    return envelope.items.findIndex((item) => {
      if (!item || typeof item !== "object") return false;
      const candidates = [
        item.cardId,
        item.cardIdentity,
        item.identity,
        item.id,
        item.key,
      ];
      return candidates.some(
        (c) => c !== undefined && c !== null && String(c) === String(identity)
      );
    });
  };

  mark = async function (...args) {
    const { type: argType, identity, status } = normaliseMarkArgs(args);
    const t = this._resolveType(argType);
    if (t) this.type = t;
    const file = this._resolveFile(t);
    if (file) this.file = file;

    if (!isStatus(status)) {
      throw new Error(`Invalid status for envelope store mark: ${status}`);
    }
    if (identity === null || identity === undefined || identity === "") {
      throw new Error("Envelope store mark requires a card identity");
    }

    await this._ensureLoaded(t);
    const envelope = this.envelope;
    if (!envelope || !Array.isArray(envelope.items)) {
      throw new Error(`No envelope loaded in ${file}`);
    }

    const idx = this._findItemIndex(envelope, identity);
    if (idx === -1) {
      throw new UnknownCardIdentityError(identity, file);
    }

    envelope.items[idx] = { ...envelope.items[idx], status };
    // keep keys/count in sync? count stays length; keys derived maybe.
    if (Array.isArray(envelope.keys)) {
      // leave keys as-is
    }
    if (typeof envelope.count === "number") {
      envelope.count = envelope.items.length;
    }

    // Atomic write.
    const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(
      dir,
      `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`
    );
    fs.writeFileSync(tmp, JSON.stringify(envelope, null, 2));
    fs.renameSync(tmp, file);

    this.envelope = envelope;
    this.loaded = true;
    return envelope.items[idx];
  };

  counts = async function (type) {
    const t = this._resolveType(type);
    if (t && t !== this.type) await this.load(t);
    else if (!this.loaded) await this.load();
    const env = this.envelope;
    const result = {};
    for (const s of KNOWN_STATUSES) result[s] = 0;
    if (env && Array.isArray(env.items)) {
      for (const item of env.items) {
        const s =
          item && typeof item.status === "string" ? item.status : "no-op";
        if (!(s in result)) result[s] = 0;
        result[s]++;
      }
    }
    return result;
  };
}

// ---- Factory function ----
export function createEnvelopeStore(...args) {
  return new EnvelopeStore(...args);
}

// ---- Exports ----
export { EnvelopeStoreError, UnknownCardIdentityError };
export { EnvelopeStore };
export default EnvelopeStore;
