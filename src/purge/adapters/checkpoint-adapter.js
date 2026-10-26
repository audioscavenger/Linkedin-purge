// CheckpointAdapter - persists checkpoint of processed keys

import fs from "node:fs";
import path from "node:path";

export class CheckpointAdapter {
  constructor(dataDir, type) {
    this.file = path.join(dataDir, `checkpoint-${type}.json`);
    this.processed = new Set();
  }

  async load() {
    try {
      const raw = fs.readFileSync(this.file, "utf8");
      const obj = JSON.parse(raw);
      this.processed = new Set(obj.processed || []);
    } catch {
      this.processed = new Set();
    }
    return { processed: this.processed, file: this.file };
  }

  async has(key) {
    return this.processed.has(key);
  }

  async add(key) {
    this.processed.add(key);
  }

  async size() {
    return this.processed.size;
  }

  async save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(
      { processed: [...this.processed], savedAt: new Date().toISOString() },
      null, 2
    ));
  }

  async reset() {
    try { fs.unlinkSync(this.file); } catch {}
    this.processed = new Set();
  }
}