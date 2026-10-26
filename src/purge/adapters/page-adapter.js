// PageAdapter - wraps Playwright page evaluation calls

export class PageAdapter {
  constructor(page) {
    this.page = page;
  }

  async collectKeys() {
    return this.page.evaluate(() => window.LP.collectKeys());
  }

  async deleteFirstEligible(skipKeys, allowedKeys = null) {
    return this.page.evaluate(
      (skipArr, allowedArr) => window.LP.deleteFirstEligible(skipArr, allowedArr),
      [...(skipKeys || [])],
      allowedKeys ? [...allowedKeys] : null
    );
  }

  async clickShowMoreIfPresent() {
    return this.page.evaluate(() => window.LP.clickShowMoreIfPresent());
  }

  async waitForTimeout(ms) {
    return this.page.waitForTimeout(ms);
  }
}