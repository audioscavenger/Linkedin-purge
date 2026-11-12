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
import { PURGE_STATUSES } from "./purge/status.mjs";

export { PURGE_STATUSES };

const KNOWN_STATUSES = new Set(Object.values(PURGE_STATUSES));

function isStatus(value) {
  return value?.constructor === String && KNOWN_STATUSES.has(value);
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

function resolveFile(dataDir, type, file, envelope) {
  if (file) return path.resolve(file);

  if (dataDir && type)
    return path.join(path.resolve(dataDir), `scan-${type}.json`);

  if (envelope && envelope.type) {
    // Derive file from envelope type if possible, but without dataDir we can't.
    return null;
  }

  return null;
}

class EnvelopeStore {
  constructor({
    dataDir = null,
    type = null,
    file = null,
    envelope = null,
  } = {}) {
    if (!(this instanceof EnvelopeStore))
      return new EnvelopeStore({ dataDir, type, file, envelope });

    // Validate: require at least one of file, dataDir+type, or envelope.
    if (!file && !(dataDir && type) && !envelope) {
      throw new Error(
        "EnvelopeStore requires at least one of: file, dataDir+type, or envelope"
      );
    }

    this.dataDir = dataDir;
    this.type = type || (envelope && envelope.type) || null;
    this.file = resolveFile(dataDir, this.type, file, envelope);

    if (file && !this.file) this.file = path.resolve(file);
    this.envelope = envelope || null;
    this.loaded = false;

    if (envelope) this.loaded = true;
  }

  // ---- Prototype methods ----

  load = async function () {
    const file = this.file;

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

    if (data && data.type) this.type = data.type;
    this.loaded = true;

    return data;
  };

  reload = function () {
    return this.load();
  };

  getEnvelope = function () {
    return this.envelope;
  };

  _ensureLoaded = async function () {
    if (!this.loaded) await this.load();

    if (!this.envelope) {
      await this.load();
    }
  };

  _findItemIndex = function (envelope, identity) {
    if (!envelope || !Array.isArray(envelope.items)) return -1;

    return envelope.items.findIndex((item) => {
      if (!item || (item.constructor !== Object && item.constructor !== Array))
        return false;

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

  mark = async function (identity, status) {
    if (!isStatus(status)) {
      throw new Error(`Invalid status for envelope store mark: ${status}`);
    }

    if (identity === null || identity === undefined || identity === "") {
      throw new Error("Envelope store mark requires a card identity");
    }

    const file = this.file;

    if (!file) throw new Error("Envelope store has no file path");

    await this._ensureLoaded();
    const envelope = this.envelope;

    if (!envelope || !Array.isArray(envelope.items)) {
      throw new Error(`No envelope loaded in ${file}`);
    }

    const idx = this._findItemIndex(envelope, identity);

    if (idx === -1) {
      throw new UnknownCardIdentityError(identity, file);
    }

    envelope.items[idx] = { ...envelope.items[idx], status };

    if (envelope.count?.constructor === Number) {
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

  counts = async function () {
    if (!this.loaded) await this.load();
    const env = this.envelope;
    const result = {};

    for (const s of KNOWN_STATUSES) result[s] = 0;

    if (env && Array.isArray(env.items)) {
      for (const item of env.items) {
        const s =
          item && item.status?.constructor === String ? item.status : "no-op";

        if (!(s in result)) result[s] = 0;
        result[s]++;
      }
    }

    return result;
  };
}

// ---- Factory function ----
export function createEnvelopeStore({
  dataDir = null,
  type = null,
  file = null,
  envelope = null,
} = {}) {
  return new EnvelopeStore({ dataDir, type, file, envelope });
}

// ---- Exports ----
export { EnvelopeStoreError, UnknownCardIdentityError };

export { EnvelopeStore };

export default EnvelopeStore;
