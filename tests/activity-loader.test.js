// Unit tests for the Activity Loader.
// No browser, no DOM, no real timers: the loader runs against a fake Activity
// Page seam that scripts growth signals and item pages, per the deep-scan
// spec's loader seam.
import { ActivityLoader } from "../src/activity-loader.js";

// One scripted Activity Page: pages[0] is the first render, pages[n] is what
// the Activity List holds after its n-th growth. The fake mirrors the injected
// collector's incremental contract: readItems() returns only items whose key is
// not already in the caller's seen list (unless ignoreSeen is set, which
// exercises the loader's own de-duplication).
class FakeActivityPage {
  constructor({ pages, growsOnSteps = [], ignoreSeen = false }) {
    this.pages = pages;
    this.growsOnSteps = growsOnSteps; // load steps (1-based) that grow the list
    this.ignoreSeen = ignoreSeen;
    this.pageIndex = 0; // which scripted page is currently rendered
    this.scrolls = 0;
    this.pendingGrowth = false;
    this.readItemsCalls = [];
    this.readGrowthCalls = 0;
  }

  signal() {
    const items = this.pages[this.pageIndex];
    return {
      count: items.length,
      scrollHeight: 1000 + this.pageIndex * 500,
      lastKey: items.length ? items[items.length - 1].key : null,
    };
  }

  async readItems(seenKeys = []) {
    this.readItemsCalls.push([...seenKeys]);
    const seen = new Set(seenKeys);
    const items = this.pages[this.pageIndex];
    return this.ignoreSeen ? items.map((it) => ({ ...it })) : items.filter((it) => !seen.has(it.key));
  }

  async readGrowth() {
    this.readGrowthCalls++;
    if (!this.pendingGrowth) return this.signal();
    this.pendingGrowth = false;
    const step = this.scrolls; // 1-based load step
    if (this.growsOnSteps.includes(step) && this.pageIndex + 1 < this.pages.length) {
      this.pageIndex++;
    }
    return this.signal();
  }

  async scrollToBottom() {
    this.scrolls++;
    this.pendingGrowth = true;
    return { tag: "MAIN", id: "workspace" };
  }
}

// A page whose batches land silently between load steps: a new batch arrives
// right after one step's read and before the next step's first growth read, so
// the polling loop never observes growth. This is the case that made a
// complete envelope omit a whole batch.
class LateBatchActivityPage {
  constructor({ pages, batchLandsAfterRead = 1 }) {
    this.pages = pages;
    this.batchLandsAfterRead = batchLandsAfterRead;
    this.pageIndex = 0;
    this.reads = 0;
    this.scrolls = 0;
    this.stepOpen = false;
    this.stepSignal = null;
    this.growthSeen = false;
  }

  signal() {
    const items = this.pages[this.pageIndex];
    return { count: items.length, scrollHeight: 1000 + this.pageIndex * 500, lastKey: items.length ? items[items.length - 1].key : null };
  }

  async readGrowth() {
    const signal = this.signal();
    if (!this.stepOpen) {
      this.stepOpen = true;
      this.stepSignal = signal;
    } else if (
      signal.count > this.stepSignal.count ||
      signal.scrollHeight > this.stepSignal.scrollHeight ||
      (signal.lastKey != null && signal.lastKey !== this.stepSignal.lastKey)
    ) {
      this.growthSeen = true;
    }
    return signal;
  }

  async scrollToBottom() {
    this.scrolls++;
    return { tag: "MAIN", id: "workspace" };
  }

  // The batch lands here, between this step's read and the next step's first
  // growth read, so no poll of any step sees the list grow.
  async readItems(seenKeys = []) {
    const seen = new Set(seenKeys);
    const items = this.pages[this.pageIndex].filter((it) => !seen.has(it.key));
    this.reads++;
    this.stepOpen = false;
    if (this.reads === this.batchLandsAfterRead && this.pageIndex + 1 < this.pages.length) this.pageIndex++;
    return items;
  }
}

// A controllable clock: the loader's real 300 ms poll interval and growth
// deadline are exercised, but no wall clock time is spent.
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    elapsed: () => t,
  };
}

function page(keys) {
  return keys.map((key) => ({ key, state: "LIKE", author: key, postHref: null, dateTime: null }));
}

function loaderFor(fakePage, timing) {
  const clock = fakeClock();
  const events = [];
  const loader = new ActivityLoader({
    page: fakePage,
    timing,
    onStep: (event) => events.push(event),
    now: clock.now,
    sleep: clock.sleep,
  });
  return { loader, clock, events };
}

const FAST_TIMING = { growthWait: 3000, maxEmptyScrolls: 8, timeout: 3600000 };

// A list that grows for two steps and then idles stops after the configured
// run of fruitless steps, reports completeness, and numbers the steps.
async function testGrowsThenIdles() {
  const fake = new FakeActivityPage({
    pages: [page(["a", "b", "c"]), page(["a", "b", "c", "d", "e"]), page(["a", "b", "c", "d", "e", "f"])],
    growsOnSteps: [1, 2],
  });
  const { loader, events } = loaderFor(fake, { ...FAST_TIMING, maxEmptyScrolls: 3 });

  const result = await loader.collectAll();

  if (!result.complete) throw new Error("Expected a complete walk");
  if (result.items.length !== 6) throw new Error(`Expected 6 items, got ${result.items.length}`);
  if (fake.scrolls !== 5) throw new Error(`Expected 2 productive + 3 idle load steps, got ${fake.scrolls} scrolls`);
  if (result.steps !== 6) throw new Error(`Expected steps=6 (first render + 5 load steps), got ${result.steps}`);

  const seenOrder = result.items.map((it) => it.key).join(",");
  if (seenOrder !== "a,b,c,d,e,f") throw new Error(`First-seen order broken: ${seenOrder}`);

  const stepByKey = Object.fromEntries(result.items.map((it) => [it.key, it.step]));
  const expected = { a: 0, b: 0, c: 0, d: 1, e: 1, f: 2 };
  for (const [key, step] of Object.entries(expected)) {
    if (stepByKey[key] !== step) throw new Error(`Item ${key} expected step ${step}, got ${stepByKey[key]}`);
  }

  // One Step Event per load step, first render included, with the numbers the
  // progress line is built from.
  if (events.length !== 6) throw new Error(`Expected 6 step events, got ${events.length}`);
  if (events[0].step !== 0 || events[0].total !== 3 || events[0].added !== 3 || events[0].waitedMs !== 0) {
    throw new Error(`Bad first step event: ${JSON.stringify(events[0])}`);
  }
  if (events[1].added !== 2 || events[1].total !== 5 || events[1].waitedMs !== 300) {
    throw new Error(`Bad productive step event: ${JSON.stringify(events[1])}`);
  }
  if (events[5].added !== 0 || events[5].total !== 6) {
    throw new Error(`Bad idle step event: ${JSON.stringify(events[5])}`);
  }
  if (!events[1].target || events[1].target.id !== "workspace") {
    throw new Error(`Step event does not name the scroll target: ${JSON.stringify(events[1])}`);
  }

  console.log("PASS: loader grows then idles (completeness, order, step numbering, step events)");
}

// A walk cut short by the timeout keeps what it collected and reports itself
// incomplete, so a partial file cannot masquerade as a full history.
async function testTimeoutCutoff() {
  const fake = new FakeActivityPage({
    pages: [page(["a", "b"]), page(["a", "b", "c", "d"])],
    growsOnSteps: [1],
  });
  const { loader } = loaderFor(fake, { growthWait: 3000, maxEmptyScrolls: 8, timeout: 1000 });

  const result = await loader.collectAll();

  if (result.complete) throw new Error("Expected an incomplete walk after the timeout");
  if (result.steps !== 3) throw new Error(`Expected steps=3 before the 1000 ms cutoff, got ${result.steps}`);
  const keys = result.items.map((it) => it.key).join(",");
  if (keys !== "a,b,c,d") throw new Error(`Collected items were not kept: ${keys}`);
  if (fake.scrolls !== 2) throw new Error(`Expected 2 load steps within the timeout, got ${fake.scrolls}`);

  console.log("PASS: timeout cutoff keeps items and marks the walk incomplete");
}

// A list that never grows costs exactly the allowed idle steps and returns the
// first render. Every later read is handed the keys already seen, so no card
// metadata is extracted twice.
async function testNeverGrows() {
  const fake = new FakeActivityPage({ pages: [page(["a", "b"])], growsOnSteps: [] });
  const { loader } = loaderFor(fake, FAST_TIMING);

  const result = await loader.collectAll();

  if (!result.complete) throw new Error("Expected a complete walk for an exhausted list");
  if (result.steps !== 9) throw new Error(`Expected 1 + 8 idle steps, got ${result.steps}`);
  if (fake.scrolls !== 8) throw new Error(`Expected exactly 8 idle scrolls, got ${fake.scrolls}`);
  if (result.items.length !== 2) throw new Error(`Expected the first render only, got ${result.items.length}`);
  // One read for the first render plus one reconciliation read per load step.
  if (fake.readItemsCalls.length !== 1 + 8) {
    throw new Error(`Expected 1 + 8 card reads (one per step), got ${fake.readItemsCalls.length}`);
  }
  for (const call of fake.readItemsCalls.slice(1)) {
    if (call.join(",") !== "a,b") {
      throw new Error(`A later read lost the seen keys, so metadata would be re-extracted: [${call}]`);
    }
  }

  console.log("PASS: never-growing list stops after the idle limit with the first render");
}

// Items are de-duplicated by key and kept in first-seen order even when the
// page hands back cards the loader has already collected.
async function testMergeDedupeAndStepNumbering() {
  const fake = new FakeActivityPage({
    pages: [page(["a", "b"]), page(["a", "b", "c"]), page(["b", "c", "d"])],
    growsOnSteps: [1, 2],
    ignoreSeen: true, // a page that ignores the incremental contract
  });
  const { loader } = loaderFor(fake, { ...FAST_TIMING, maxEmptyScrolls: 1 });

  const result = await loader.collectAll();

  const keys = result.items.map((it) => it.key).join(",");
  if (keys !== "a,b,c,d") throw new Error(`Expected [a,b,c,d], got [${keys}]`);
  const stepByKey = Object.fromEntries(result.items.map((it) => [it.key, it.step]));
  const expected = { a: 0, b: 0, c: 1, d: 2 };
  for (const [key, step] of Object.entries(expected)) {
    if (stepByKey[key] !== step) throw new Error(`Item ${key} expected step ${step}, got ${stepByKey[key]}`);
  }
  if (result.items.length !== 4) throw new Error(`Expected 4 de-duplicated items, got ${result.items.length}`);

  console.log("PASS: merge de-duplicates by key with first-seen order and step numbers");
}

// Every read after the first render hands the already-seen keys to the page, so
// a page that honours them returns only new cards.
async function testSeenKeysHandOff() {
  const fake = new FakeActivityPage({
    pages: [page(["a", "b"]), page(["a", "b", "c"]), page(["a", "b", "c", "d"])],
    growsOnSteps: [1, 2],
  });
  const { loader } = loaderFor(fake, { ...FAST_TIMING, maxEmptyScrolls: 1 });

  const result = await loader.collectAll();

  if (fake.readItemsCalls[0].length !== 0) {
    throw new Error(`First render must be read with no seen keys, got [${fake.readItemsCalls[0]}]`);
  }
  if (fake.readItemsCalls[1].join(",") !== "a,b") {
    throw new Error(`Step 1 saw the wrong keys: [${fake.readItemsCalls[1]}]`);
  }
  if (fake.readItemsCalls[2].join(",") !== "a,b,c") {
    throw new Error(`Step 2 saw the wrong keys: [${fake.readItemsCalls[2]}]`);
  }
  // Two productive steps plus the one idle step that ends the walk.
  if (fake.readItemsCalls.length !== 4) {
    throw new Error(`Expected one card read per step after the render, got ${fake.readItemsCalls.length}`);
  }
  if (fake.readItemsCalls[3].join(",") !== "a,b,c,d") {
    throw new Error(`The idle step saw the wrong keys: [${fake.readItemsCalls[3]}]`);
  }
  const keys = result.items.map((it) => it.key).join(",");
  if (keys !== "a,b,c,d") throw new Error(`Expected [a,b,c,d], got [${keys}]`);

  console.log("PASS: already-seen keys are handed to the page on every later step");
}

// timing.timeout 0 means no time limit, the same way purge's runner treats it
// and the way `--limit 0` reads: the walk ends when the list stops growing.
async function testZeroTimeoutWalksToEnd() {
  const fake = new FakeActivityPage({
    pages: [page(["a"]), page(["a", "b"]), page(["a", "b", "c"])],
    growsOnSteps: [1, 2],
  });
  const { loader } = loaderFor(fake, { growthWait: 3000, maxEmptyScrolls: 2, timeout: 0 });

  const result = await loader.collectAll();

  if (!result.complete) throw new Error("timeout 0 must not cut the walk short");
  if (result.items.length !== 3) throw new Error(`Expected all 3 items, got ${result.items.length}`);
  if (result.steps !== 5) throw new Error(`Expected 1 + 2 productive + 2 idle steps = 5, got ${result.steps}`);
  if (fake.scrolls !== 4) throw new Error(`Expected the walk to reach the idle limit, got ${fake.scrolls} scrolls`);

  console.log("PASS: timeout 0 is no time limit, so the walk ends when the list stops growing");
}

// An absent (or null) timeout is not "no limit": it falls back to the built-in
// one hour, which is what the shipped timing defaults and README describe.
async function testAbsentTimeoutUsesDefault() {
  const fake = new FakeActivityPage({ pages: [page(["a"])], growsOnSteps: [] });
  // 600000 ms per step: the sixth step reaches the 3600000 ms default.
  const { loader } = loaderFor(fake, { growthWait: 600000, maxEmptyScrolls: 8 });

  const result = await loader.collectAll();

  if (result.complete) throw new Error("An absent timeout must fall back to the 3600000 ms default");
  if (result.steps !== 7) throw new Error(`Expected the cutoff on the 6th load step (steps=7), got ${result.steps}`);
  if (fake.scrolls !== 6) throw new Error(`Expected 6 load steps before the default cutoff, got ${fake.scrolls}`);

  console.log("PASS: absent timeout falls back to the 3600000 ms default");
}

// Cards can land between one step's last poll and the next step's first growth
// read. Nothing observes growth, so the step has to read the unseen cards once
// before it counts toward the idle limit; otherwise a complete envelope can
// silently omit a whole batch (the under-report user story 7 forbids).
async function testLateBatchIsReconciled() {
  const fake = new LateBatchActivityPage({
    pages: [page(["a", "b"]), page(["a", "b", "c", "d"])],
    batchLandsAfterRead: 1,
  });
  const { loader } = loaderFor(fake, { growthWait: 3000, maxEmptyScrolls: 2, timeout: 3600000 });

  const result = await loader.collectAll();

  if (!result.complete) throw new Error("Expected the walk to stay complete after reconciling the late batch");
  const keys = result.items.map((it) => it.key).join(",");
  if (keys !== "a,b,c,d") throw new Error(`The late batch was never collected: [${keys}]`);
  if (fake.growthSeen) throw new Error("The fake page must not report growth for this case");
  if (result.steps !== 4) throw new Error(`Expected 1 + 3 load steps (1 reconciled, 2 idle) = 4, got ${result.steps}`);

  const stepByKey = Object.fromEntries(result.items.map((it) => [it.key, it.step]));
  if (stepByKey.c !== 1 || stepByKey.d !== 1) {
    throw new Error(`The reconciled batch must carry the step that read it: ${JSON.stringify(stepByKey)}`);
  }

  console.log("PASS: a batch that lands silently between steps is reconciled, not dropped");
}

// The first render is one operation: one read, one step, complete, items in
// step 0, and the same step-0 event the shallow path logs.
async function testFirstRenderOperation() {
  const fake = new FakeActivityPage({ pages: [page(["a", "b"])], growsOnSteps: [] });
  const { loader, events } = loaderFor(fake, FAST_TIMING);

  const result = await loader.readFirstRender();

  if (result.steps !== 1) throw new Error(`A first render is one step, got ${result.steps}`);
  if (result.complete !== true) throw new Error("A first render is complete");
  if (result.items.length !== 2) throw new Error(`Expected 2 items, got ${result.items.length}`);
  if (events.length !== 1) throw new Error(`Expected exactly one step event, got ${events.length}`);
  const event = events[0];
  if (event.step !== 0) throw new Error(`The first-render event must be step 0, got ${event.step}`);
  if (event.total !== 2 || event.added !== 2) throw new Error(`Bad first-render totals: ${JSON.stringify(event)}`);
  if (event.waitedMs !== 0 || event.target !== null) {
    throw new Error(`A first render waits for nothing and has no target: ${JSON.stringify(event)}`);
  }
  if (fake.scrolls !== 0) throw new Error("The first render must not scroll");

  console.log("PASS: first-render operation (one step, complete, step 0, one step-0 event)");
}

const tests = [
  testGrowsThenIdles,
  testTimeoutCutoff,
  testNeverGrows,
  testMergeDedupeAndStepNumbering,
  testSeenKeysHandOff,
  testZeroTimeoutWalksToEnd,
  testAbsentTimeoutUsesDefault,
  testLateBatchIsReconciled,
  testFirstRenderOperation,
];

async function main() {
  let failed = 0;
  for (const fn of tests) {
    try {
      await fn();
    } catch (e) {
      console.error(`FAIL: ${fn.name} - ${e.message}`);
      failed++;
    }
  }
  const passed = tests.length - failed;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
