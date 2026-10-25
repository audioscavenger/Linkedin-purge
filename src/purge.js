// Purge Runner module with adapter interfaces and concrete implementations

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

// Core module - owns the purge lifecycle
export class PurgeRunner {
  constructor({
    pageAdapter,
    checkpointAdapter,
    reporterAdapter,
    confirmAdapter,
  }) {
    this.pageAdapter = pageAdapter;
    this.checkpointAdapter = checkpointAdapter;
    this.reporterAdapter = reporterAdapter;
    this.confirmAdapter = confirmAdapter;
  }

  async run(options = {}) {
    const startTime = Date.now();
    const type = options.type || "comments";
    const timeoutMs = options.timeoutMs || 3600000;
    const batchSize = options.batchSize || 10;

    // Load existing checkpoint
    await this.checkpointAdapter.load();

    // Confirm before destructive action
    const pendingCount = this.checkpointAdapter.processed.size; // will be verified against actual keys in loop
    const confirmed = await this.confirmAdapter.confirm(
      `Delete ${pendingCount} ${type} items? Type YES to proceed: `
    );
    if (!confirmed) {
      return { type, deleted: 0, processed: this.checkpointAdapter.processed.size, durationMs: 0, reportPath: null };
    }

    // Initialize report
    await this.reporterAdapter.open(type);

    let deleted = 0;
    let retries = 0;
    let emptyScrolls = 0;
    const purgeStart = Date.now();

    while (true) {
      // Timeout check
      if (timeoutMs > 0 && Date.now() - purgeStart > timeoutMs) {
        break;
      }

      // Collect current eligible items
      const keys = await this.pageAdapter.collectKeys();
      const pending = keys.filter(k => !this.checkpointAdapter.processed.has(k));

      if (pending.length === 0) {
        emptyScrolls++;
        if (emptyScrolls >= (options.maxEmptyScrolls || 8)) {
          break; // No more items found
        }
        await this.pageAdapter.waitForTimeout(1200);
        continue;
      }
      emptyScrolls = 0;

      // Deletion loop
      const result = await this.pageAdapter.deleteFirstEligible(
        Array.from(this.checkpointAdapter.processed)
      );

      if (result && result.ok) {
        deleted++;
        retries = 0;
        await this.checkpointAdapter.add(result.key);
        await this.reporterAdapter.write({
          key: result.key,
          ts: new Date().toISOString(),
          state: result.state || null,
          author: result.author || null,
          postHref: result.postHref || null,
          dateTime: result.dateTime || null,
        });

        // Periodic checkpoint save
        if (deleted % batchSize === 0) {
          await this.checkpointAdapter.save();
        }
      } else {
        // No eligible item right now — treat as empty scroll iteration
        emptyScrolls++;
        if (emptyScrolls >= (options.maxEmptyScrolls || 8)) {
          break;
        }
      }

      // Brief pause between actions
      await this.pageAdapter.waitForTimeout(1500);
    }

    // Final save and close
    await this.checkpointAdapter.save();
    const reportPath = await this.reporterAdapter.close();

    return {
      type,
      deleted,
      processed: this.checkpointAdapter.processed.size,
      durationMs: Date.now() - startTime,
      reportPath,
    };
  }
}

// Adapter: wraps Playwright page evaluation calls
export class PageAdapter {
  constructor(page) {
    this.page = page;
  }

  async collectKeys() {
    return this.page.evaluate(() => window.LP.collectKeys());
  }

  async deleteFirstEligible(skipKeys) {
    return this.page.evaluate(
      (skipArr) => window.LP.deleteFirstEligible(skipArr),
      [...(skipKeys || [])]
    );
  }

  async clickShowMoreIfPresent() {
    return this.page.evaluate(() => window.LP.clickShowMoreIfPresent());
  }

  async waitForTimeout(ms) {
    return this.page.waitForTimeout(ms);
  }
}

// Adapter: persists checkpoint of processed keys
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

// Adapter: writes purge report JSON with item metadata
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

// Adapter: prompts user for confirmation before destructive action
export class ConfirmAdapter {
  async confirm(message) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) => {
      rl.question(`${message} `, (answer) => {
        rl.close();
        resolve(/^yes$/i.test(answer.trim()));
      });
    });
  }
}
