// ReporterAdapter - writes purge report JSON and owns the Report Entry:
// it stamps the action timestamp itself and pins the canonical field set,
// so the entry shape cannot drift from what the runner hands over.

import fs from "node:fs";
import path from "node:path";

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

  // The Report Entry is constructed here, at the writer seam, and always
  // carries exactly the glossary field set: key, ts, state, author,
  // postHref, dateTime. Absent fields are normalized to null at the writer,
  // and ts is always our own stamp - a caller-supplied ts is never carried
  // through, so the on-disk shape stays the same six fields either way.
  async write(item = {}) {
    this.items.push({
      key: item.key ?? null,
      ts: new Date().toISOString(),
      state: item.state ?? null,
      author: item.author ?? null,
      postHref: item.postHref ?? null,
      dateTime: item.dateTime ?? null,
    });
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
