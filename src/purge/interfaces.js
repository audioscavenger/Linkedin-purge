// Purge Runner module - adapter interface definitions only

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
    // This will be implemented in the main purge class file
    throw new Error("Not implemented");
  }
}

// Adapter: wraps Playwright page evaluation calls
export class PageAdapter {
  constructor(page) {
    this.page = page;
  }

  async collectKeys() { throw new Error("Not implemented"); }
  async deleteFirstEligible(eligibleKeys) { throw new Error("Not implemented"); }
  async clickShowMoreIfPresent() { throw new Error("Not implemented"); }
  async waitForTimeout(ms) { throw new Error("Not implemented"); }
}

// Adapter: persists checkpoint of processed keys
export class CheckpointAdapter {
  constructor(dataDir, type) {
    // Implementation in concrete adapter
  }

  async load() { throw new Error("Not implemented"); }
  async has(key) { throw new Error("Not implemented"); }
  async add(key) { throw new Error("Not implemented"); }
  async size() { throw new Error("Not implemented"); }
  async save() { throw new Error("Not implemented"); }
  async reset() { throw new Error("Not implemented"); }
}

// Adapter: writes purge report JSON with item metadata
export class ReporterAdapter {
  constructor({ dataDir = "data" } = {}) {
    // Implementation in concrete adapter
  }

  async open(type) { throw new Error("Not implemented"); }
  async write(item) { throw new Error("Not implemented"); }
  async close() { throw new Error("Not implemented"); }
}

// Adapter: prompts user for confirmation before destructive action
export class ConfirmAdapter {
  async confirm(message) { throw new Error("Not implemented"); }
}