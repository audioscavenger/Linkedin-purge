// PageAdapter - wraps Playwright page evaluation calls

export class PageAdapter {
  constructor(page) {
    this.page = page;
  }

  async collectKeys() {
    return this.page.evaluate(() => window.LP.collectKeys());
  }

  // Takes the runner-precomputed eligible-key list; the in-page side does a
  // plain membership test over it (the eligibility rule lives in the runner).
  async deleteFirstEligible(eligibleKeys) {
    return this.page.evaluate(
      (eligibleArr) => window.LP.deleteFirstEligible(eligibleArr),
      [...(eligibleKeys || [])]
    );
  }

  async clickShowMoreIfPresent() {
    return this.page.evaluate(() => window.LP.clickShowMoreIfPresent());
  }

  async waitForTimeout(ms) {
    return this.page.waitForTimeout(ms);
  }
}