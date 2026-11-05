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

  async collect() { throw new Error("Not implemented"); }
  async oneCardAct(key) { throw new Error("Not implemented"); }
  async loadStep() { throw new Error("Not implemented"); }
  async wait(ms) { throw new Error("Not implemented"); }
}

// Adapter: prompts user for confirmation before destructive action
export class ConfirmAdapter {
  async confirm(message) { throw new Error("Not implemented"); }
}
