// Unit tests for the scan envelope builder: the documented file contract that
// `purge --input` reads (ADR 0001). No browser, no page: the builder is a pure
// function, so the shallow and deep-partial shapes are pinned here.
import { buildScanEnvelope } from "../src/scan-envelope.js";

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

const tests = [testShallowEnvelope, testDeepPartialEnvelope];

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
