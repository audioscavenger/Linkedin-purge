// PageAdapter - wraps Playwright page evaluation calls

export class PageAdapter {
  constructor(page) {
    this.page = page;
  }

  async collect() {
    return this.page.evaluate(() => window.LP.collectKeys());
  }

  // Act on exactly one card by its card identity / key.
  // The runner pre-computes eligibility; the adapter just hands the key
  // to window.LP.deleteOneCard.
  async oneCardAct(key) {
    return this.page.evaluate((k) => window.LP.deleteOneCard(k), key);
  }

  // Collect all card IDs (container element ids) from the activity list.
  // These are used as stable identifiers for full-purge mode.
  async collectCardIds() {
    return this.page.evaluate(() => window.LP.collectCardIds());
  }

  async loadStep() {
    return this.page.evaluate(() => window.LP.scrollActivityListToBottom());
  }

  async wait(ms) {
    return this.page.waitForTimeout(ms);
  }
}
