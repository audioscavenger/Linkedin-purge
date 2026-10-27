// Unit tests for the Activity Loader and the scan envelope builder.
// No browser, no DOM, no real timers: the loader runs against a fake Activity
// Page seam that scripts growth signals and item pages, per the deep-scan
// spec's loader seam.
import { ActivityLoader, buildScanEnvelope } from "../src/activity-loader.js";

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

const FAST_TIMING = { scrollWait: 3000, maxEmptyScrolls: 8, timeout: 3600000 };

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
  const { loader } = loaderFor(fake, { scrollWait: 3000, maxEmptyScrolls: 8, timeout: 1000 });

  const result = await loader.collectAll();

  if (result.complete) throw new Error("Expected an incomplete walk after the timeout");
  if (result.steps !== 3) throw new Error(`Expected steps=3 before the 1000 ms cutoff, got ${result.steps}`);
  const keys = result.items.map((it) => it.key).join(",");
  if (keys !== "a,b,c,d") throw new Error(`Collected items were not kept: ${keys}`);
  if (fake.scrolls !== 2) throw new Error(`Expected 2 load steps within the timeout, got ${fake.scrolls}`);

  console.log("PASS: timeout cutoff keeps items and marks the walk incomplete");
}

// A list that never grows costs exactly the allowed idle steps, returns the
// first render, and never re-reads card metadata.
async function testNeverGrows() {
  const fake = new FakeActivityPage({ pages: [page(["a", "b"])], growsOnSteps: [] });
  const { loader } = loaderFor(fake, FAST_TIMING);

  const result = await loader.collectAll();

  if (!result.complete) throw new Error("Expected a complete walk for an exhausted list");
  if (result.steps !== 9) throw new Error(`Expected 1 + 8 idle steps, got ${result.steps}`);
  if (fake.scrolls !== 8) throw new Error(`Expected exactly 8 idle scrolls, got ${fake.scrolls}`);
  if (result.items.length !== 2) throw new Error(`Expected the first render only, got ${result.items.length}`);
  if (fake.readItemsCalls.length !== 1) {
    throw new Error(`Card metadata was read ${fake.readItemsCalls.length} times for a list that never grew`);
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

// Every load step after the first hands the already-seen keys to the page, and
// a page that honours them returns only new cards.
async function testSeenKeysHandOff() {
  const fake = new FakeActivityPage({
    pages: [page(["a", "b"]), page(["a", "b", "c"]), page(["a", "b", "c", "d"])],
    growsOnSteps: [1, 2],
  });
  const { loader } = loaderFor(fake, { ...FAST_TIMING, maxEmptyScrolls: 1 });

  const result = await loader.collectAll();

  if (fake.readItemsCalls.length !== 3) {
    throw new Error(`Expected one card read per growth, got ${fake.readItemsCalls.length}`);
  }
  if (fake.readItemsCalls[0].length !== 0) {
    throw new Error(`First render must be read with no seen keys, got [${fake.readItemsCalls[0]}]`);
  }
  if (fake.readItemsCalls[1].join(",") !== "a,b") {
    throw new Error(`Step 1 saw the wrong keys: [${fake.readItemsCalls[1]}]`);
  }
  if (fake.readItemsCalls[2].join(",") !== "a,b,c") {
    throw new Error(`Step 2 saw the wrong keys: [${fake.readItemsCalls[2]}]`);
  }
  const keys = result.items.map((it) => it.key).join(",");
  if (keys !== "a,b,c,d") throw new Error(`Expected [a,b,c,d], got [${keys}]`);

  console.log("PASS: already-seen keys are handed to the page on every later step");
}

// A shallow scan keeps the historical envelope contract: one step, complete,
// every item in step 0, and every pre-existing field meaning unchanged.
async function testShallowEnvelope() {
  const items = [
    { key: "reaction:1", state: "LIKE", author: "A", postHref: null, dateTime: "Sep 16" },
    { key: "reaction:2", state: "LIKE", author: "B", postHref: "/feed/update/2", dateTime: "Sep 17" },
  ];
  const envelope = buildScanEnvelope({
    type: "likes",
    items,
    steps: 1,
    complete: true,
    scannedAt: "2026-10-26T07:49:00.000Z",
  });

  const fields = Object.keys(envelope);
  const expectedFields = ["type", "count", "keys", "items", "scannedAt", "steps", "complete"];
  if (fields.join(",") !== expectedFields.join(",")) {
    throw new Error(`Envelope fields changed: [${fields.join(", ")}]`);
  }
  if (envelope.type !== "likes") throw new Error(`type not preserved: ${envelope.type}`);
  if (envelope.count !== 2) throw new Error(`count expected 2, got ${envelope.count}`);
  if (envelope.keys.join(",") !== "reaction:1,reaction:2") {
    throw new Error(`keys expected [reaction:1, reaction:2], got [${envelope.keys}]`);
  }
  if (envelope.scannedAt !== "2026-10-26T07:49:00.000Z") throw new Error("scannedAt not preserved");
  if (envelope.steps !== 1) throw new Error(`A shallow scan is one step, got ${envelope.steps}`);
  if (envelope.complete !== true) throw new Error("A shallow scan is complete");
  for (const item of envelope.items) {
    if (item.step !== 0) throw new Error(`Shallow item ${item.key} expected step 0, got ${item.step}`);
  }
  // Pre-existing item fields survive unchanged, and the caller's items are not
  // mutated by the builder.
  if (envelope.items[0].author !== "A" || envelope.items[1].postHref !== "/feed/update/2") {
    throw new Error("Item fields were not preserved");
  }
  if (items[0].step !== undefined) throw new Error("The builder mutated the caller's items");

  console.log("PASS: shallow envelope shape (one step, complete, every item step 0)");
}

// A deep walk cut short records how far it got and stays honest about it.
async function testDeepPartialEnvelope() {
  const items = [
    { key: "reaction:0", state: "LIKE", author: "A", postHref: null, dateTime: null, step: 0 },
    { key: "reaction:37", state: "LOVE", author: "B", postHref: null, dateTime: null, step: 5 },
  ];
  const envelope = buildScanEnvelope({
    type: "likes",
    items,
    steps: 6,
    complete: false,
    scannedAt: "2026-10-26T08:00:00.000Z",
  });

  if (envelope.steps !== 6) throw new Error(`steps expected 6, got ${envelope.steps}`);
  if (envelope.complete !== false) throw new Error("A cut-short walk must be incomplete");
  if (envelope.count !== 2) throw new Error(`count expected 2, got ${envelope.count}`);
  if (envelope.keys.join(",") !== "reaction:0,reaction:37") throw new Error(`keys wrong: [${envelope.keys}]`);
  const steps = envelope.items.map((it) => it.step).join(",");
  if (steps !== "0,5") throw new Error(`Per-item steps lost: [${steps}]`);

  console.log("PASS: deep partial envelope shape (many steps, incomplete, per-item steps kept)");
}

const tests = {
  testGrowsThenIdles,
  testTimeoutCutoff,
  testNeverGrows,
  testMergeDedupeAndStepNumbering,
  testSeenKeysHandOff,
  testShallowEnvelope,
  testDeepPartialEnvelope,
};

async function main() {
  let passed = 0;
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try {
      await fn();
      passed++;
    } catch (e) {
      console.error(`FAIL: ${name} - ${e.message}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
