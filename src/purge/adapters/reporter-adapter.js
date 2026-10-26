// ReporterAdapter - writes purge report JSON with item metadata

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

  async write(item) {
    this.items.push(item);
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