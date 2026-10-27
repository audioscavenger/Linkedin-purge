// Activity Loader: the one implementation of scroll-and-wait for the LinkedIn
// Activity List.
//
// It owns three operations over a small Activity Page seam:
//   readItems(seenKeys)  - the items currently rendered, skipping seen cards
//   readGrowth()         - the cheap growth signal (no card metadata)
//   scrollToBottom()     - scroll the Activity List and name the element used
//
// `collectAll()` walks the list until it stops growing (complete) or until the
// configured timeout expires (incomplete, keeping what it collected).
//
// The page seam is a plain object, not a Playwright page, so the stopping rules
// are tested without a browser; `createActivityPage()` adapts a real page to it.

// Poll cadence while waiting for a load step to produce cards. Machine
// latency, not user preference, so it is a constant and not configuration.
export const POLL_INTERVAL_MS = 300;

const DEFAULT_GROWTH_DEADLINE_MS = 3000;
const DEFAULT_IDLE_LIMIT = 8;
const DEFAULT_TIMEOUT_MS = 3600000;

function numberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Did the Activity List grow between two growth signals? A larger card count, a
// taller scroll area, or a different last card all count: any of them means the
// page loaded more content.
function grewBetween(before, after) {
  if (!before || !after) return false;
  if (after.count > before.count) return true;
  if (after.scrollHeight > before.scrollHeight) return true;
  return after.lastKey != null && after.lastKey !== before.lastKey;
}

export class ActivityLoader {
  constructor({ page, timing = {}, onStep = null, now = Date.now, sleep = defaultSleep }) {
    this.page = page;
    this.timing = timing || {};
    this.onStep = onStep;
    this.now = now;
    this.sleep = sleep;
  }

  // How long one load step may wait for the list to grow (timing.scrollWait).
  get growthDeadlineMs() {
    return numberOr(this.timing.scrollWait, DEFAULT_GROWTH_DEADLINE_MS);
  }

  // Fruitless load steps allowed before the end of the list is declared
  // (timing.maxEmptyScrolls).
  get idleLimit() {
    return numberOr(this.timing.maxEmptyScrolls, DEFAULT_IDLE_LIMIT);
  }

  // Overall walk limit (timing.timeout).
  get timeoutMs() {
    return numberOr(this.timing.timeout, DEFAULT_TIMEOUT_MS);
  }

  // Read the items currently in the page. The seen keys are handed to the
  // injected collector, which then skips metadata extraction for those cards.
  async readItems(seenKeys = []) {
    return this.page.readItems(seenKeys);
  }

  // Perform one load step: read the growth signal, scroll the Activity List to
  // its bottom, then poll until the signal grows or the wait budget expires.
  // Returns { grew, waitedMs, target }.
  async loadStep(maxWaitMs = this.growthDeadlineMs) {
    const before = await this.page.readGrowth();
    const target = await this.page.scrollToBottom();
    const startedAt = this.now();

    let grew = false;
    while (true) {
      const elapsed = this.now() - startedAt;
      if (elapsed >= maxWaitMs) break;
      await this.sleep(Math.min(POLL_INTERVAL_MS, maxWaitMs - elapsed));
      const after = await this.page.readGrowth();
      if (grewBetween(before, after)) {
        grew = true;
        break;
      }
    }

    return { grew, waitedMs: this.now() - startedAt, target: target || null };
  }

  // Walk the Activity List to exhaustion. The first render is step 0; each load
  // step gets the next step number. Growth ends a step immediately and resets
  // the idle counter; a fruitless step increments it.
  async collectAll() {
    const startedAt = this.now();
    const items = [];
    const seenKeys = new Set();
    let steps = 0;
    let idle = 0;

    // Step 0 is what LinkedIn rendered on first load.
    const firstItems = await this.readItems([]);
    let added = mergeItems(items, seenKeys, firstItems, 0);
    steps = 1;
    this.emitStep({ step: 0, total: items.length, added, waitedMs: 0, target: null });

    while (idle < this.idleLimit) {
      const remaining = this.timeoutMs - (this.now() - startedAt);
      if (remaining <= 0) return { items, steps, complete: false };

      const step = steps; // zero-based: the first load step after the render is 1
      const result = await this.loadStep(Math.min(this.growthDeadlineMs, remaining));
      added = 0;
      if (result.grew) {
        const freshItems = await this.readItems([...seenKeys]);
        added = mergeItems(items, seenKeys, freshItems, step);
        idle = 0;
      } else {
        idle++;
      }
      steps++;
      this.emitStep({ step, total: items.length, added, waitedMs: result.waitedMs, target: result.target });

      if (this.now() - startedAt >= this.timeoutMs) return { items, steps, complete: false };
      if (!result.grew && idle >= this.idleLimit) return { items, steps, complete: true };
    }

    return { items, steps, complete: true };
  }

  emitStep(event) {
    if (this.onStep) this.onStep(event);
  }
}

// Merge freshly read items into the walk, keeping first-seen order and stamping
// each new item with the step it first appeared in. Returns how many were added.
function mergeItems(items, seenKeys, incoming, step) {
  let added = 0;
  for (const item of incoming || []) {
    if (!item || item.key == null || seenKeys.has(item.key)) continue;
    seenKeys.add(item.key);
    items.push({ ...item, step });
    added++;
  }
  return added;
}

// Adapt a Playwright page to the Activity Page seam. Kept here so the browser
// edge is one small, obvious object and the loader never imports Playwright.
export function createActivityPage(page) {
  return {
    readItems: (seenKeys) => page.evaluate((keys) => window.LP.collectItems(keys), seenKeys),
    readGrowth: () => page.evaluate(() => window.LP.readGrowthSignal()),
    scrollToBottom: () => page.evaluate(() => window.LP.scrollActivityListToBottom()),
  };
}

// Build the scan envelope. The one place the documented file contract is
// assembled: the pre-existing fields keep their meanings (type, count, keys,
// items, scannedAt) and the walk adds per-item `step` plus top-level `steps`
// and `complete`, so `purge --input` reads old and new files alike.
// Items without a step are first-render items, hence step 0.
export function buildScanEnvelope({ type, items, steps = 1, complete = true, scannedAt = new Date().toISOString() }) {
  const withSteps = (items || []).map((item) => ({
    ...item,
    step: Number.isInteger(item.step) ? item.step : 0,
  }));
  return {
    type,
    count: withSteps.length,
    keys: withSteps.map((item) => item.key).filter(Boolean),
    items: withSteps,
    scannedAt,
    steps,
    complete,
  };
}
