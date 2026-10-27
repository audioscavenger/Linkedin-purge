// Activity Loader: the one implementation of scroll-and-wait for the LinkedIn
// Activity List.
//
// It owns four operations over a small Activity Page seam:
//   readItems(seenKeys)  - the items currently rendered, skipping seen cards
//   readGrowth()         - the cheap growth signal (no card metadata)
//   scrollToBottom()     - scroll the Activity List and name the element used
//   loadStep()           - one scroll-and-poll round, reporting whether it grew
//
// `readFirstRender()` is what plain scan collects: one read, one step, complete.
// `collectAll()` walks the list until it stops growing (complete) or until the
// configured timeout expires (incomplete, keeping what it collected); a timeout
// of 0 means no limit.
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

  // Overall walk limit (timing.timeout). 0 means no time limit, the same way
  // purge's runner treats it (`timeoutMs > 0` guards its check) and the way
  // `--limit 0` reads. Absent or null falls back to the built-in hour.
  get timeoutMs() {
    const value = numberOr(this.timing.timeout, DEFAULT_TIMEOUT_MS);
    return value === 0 ? Number.POSITIVE_INFINITY : value;
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

  // The first render is one operation: the cards LinkedIn put on the page on
  // load, one step, complete, every item in step 0. The shallow scan is only
  // this, and the walk starts with it, so both paths share one read and one
  // step-0 event.
  async readFirstRender() {
    const items = (await this.readItems([])) || [];
    this.emitStep({ step: 0, total: items.length, added: items.length, waitedMs: 0, target: null });
    return { items, steps: 1, complete: true };
  }

  // Walk the Activity List to exhaustion. The first render is step 0; each load
  // step gets the next step number. Growth ends a step immediately and resets
  // the idle counter; a fruitless step increments it.
  async collectAll() {
    const startedAt = this.now();
    const items = [];
    const seenKeys = new Set();
    let idle = 0;

    // Step 0 is what LinkedIn rendered on first load.
    const first = await this.readFirstRender();
    let added = mergeItems(items, seenKeys, first.items, 0);
    let steps = first.steps;

    while (idle < this.idleLimit) {
      const remaining = this.timeoutMs - (this.now() - startedAt);
      if (remaining <= 0) return { items, steps, complete: false };

      const step = steps; // zero-based: the first load step after the render is 1
      const result = await this.loadStep(Math.min(this.growthDeadlineMs, remaining));
      // Read the unseen cards once per step, whether or not the polling loop saw
      // growth. Cards can land between one step's last poll and the next step's
      // first growth read, and a growth-only read would drop that batch from a
      // walk that still calls itself complete. A step that turns up cards this
      // way was productive after all.
      const freshItems = await this.readItems([...seenKeys]);
      added = mergeItems(items, seenKeys, freshItems, step);
      idle = result.grew || added > 0 ? 0 : idle + 1;
      steps++;
      this.emitStep({ step, total: items.length, added, waitedMs: result.waitedMs, target: result.target });

      if (this.now() - startedAt >= this.timeoutMs) return { items, steps, complete: false };
      if (idle >= this.idleLimit) return { items, steps, complete: true };
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
