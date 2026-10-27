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
  // The contract is one list: the runner always passes an array, so no
  // defensive copy or null-guard here.
  async deleteFirstEligible(eligibleKeys) {
    return this.page.evaluate(
      (keys) => window.LP.deleteFirstEligible(keys),
      eligibleKeys
    );
  }

  async waitForTimeout(ms) {
    return this.page.waitForTimeout(ms);
  }
}
