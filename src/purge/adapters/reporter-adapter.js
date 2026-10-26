// ReporterAdapter - writes purge report JSON and owns the Report Entry:
// it stamps the action timestamp itself and pins the canonical field set,
// so the entry shape cannot drift from what the runner hands over.

import fs from "node:fs";
import path from "node:path";

// The Report Entry's field set, named once. The writer builds every entry
// from exactly these and exports the list so consumers (the writer-seam
// test) import it instead of re-listing the six names - one source of truth
// for the canonical shape, in the module that owns the entry.
export const REPORT_ENTRY_FIELDS = ["key", "ts", "state", "author", "postHref", "dateTime"];

export class ReporterAdapter {
  constructor({ dataDir = "data" } = {}) {
    this.dataDir = dataDir;
    this.type = null;
    this.items = [];
  }

  async open(type) {
    this.type = type;
    this.items = [];
    this.filePath = path.join(this.dataDir, `report-${type}-${Date.now()}.json`);
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  // The Report Entry is constructed here, at the writer seam, from exactly
  // the canonical field set named above (REPORT_ENTRY_FIELDS, in that
  // order). Absent fields are normalized to null at the writer, and ts is
  // always our own stamp - a caller-supplied ts is never carried through, so
  // the on-disk shape stays the same six fields either way.
  async write(item = {}) {
    const entry = {};
    for (const field of REPORT_ENTRY_FIELDS) {
      // ts is the writer's own stamp, never the caller's; every other field
      // passes through, normalized to null when the runner left it absent.
      entry[field] = field === "ts" ? new Date().toISOString() : item[field] ?? null;
    }
    this.items.push(entry);
  }

  async close() {
    const report = {
      type: this.type,
      deleted: this.items.length,
      items: this.items,
    };
    fs.writeFileSync(this.filePath, JSON.stringify(report, null, 2));
    return this.filePath;
  }
}
