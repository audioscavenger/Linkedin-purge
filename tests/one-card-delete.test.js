// Unit tests for the one-card delete by Card Identity (src/linkedin-dom.js).
// The injected in-page helpers are plain JS with no imports, so the real
// file is evaluated in a Node vm with a minimal fake DOM and the exported
// window.LP.deleteOneCard(...) is called from there. No browser required;
// the live page check covers the real LinkedIn markup.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert";

const src = readFileSync("src/linkedin-dom.js", "utf8");

// A fake reaction card: role=listitem container with an id (the Card
// Identity), and exactly one reaction button inside it.
function makeReactionWorld({ toggleWorks = true } = {}) {
  const card = {
    id: "card-42",
    getAttribute: (name) => (name === "role" ? "listitem" : null),
    querySelectorAll(sel) {
      if (sel === "button") return [reactionBtn];
      return [];
    },
    querySelector(sel) {
      if (sel.includes("feed/update")) {
        return { getAttribute: () => "/feed/update/1" };
      }
      return null;
    },
  };
  const reactionBtn = {
    parentElement: card,
    _state: "LIKE",
    getAttribute(name) {
      return name === "aria-label" ? `Reaction button state: ${this._state}` : null;
    },
    click() {
      if (toggleWorks) this._state = "NO REACTION";
    },
  };
  card.parentElement = null;
  const document = {
    getElementById: (id) => (id === "card-42" ? card : null),
    querySelectorAll: (sel) => (sel === "button" ? [reactionBtn] : []),
    querySelector: () => null,
  };
  const window = { location: { pathname: "/recent-activity/reactions/" } };
  const ctx = {
    window,
    document,
    setTimeout,
    clearTimeout,
    console,
    Date,
    Promise,
    navigator: undefined,
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { window, card, reactionBtn };
}

async function deleteOne(world, cardId) {
  return world.window.LP.deleteOneCard(cardId);
}

const tests = [];

// Success: one card deleted, result names the Card Identity.
tests.push({
  name: "toggle-Likeda reaction card deletes exactly that card",
  fn: async () => {
    const w = makeReactionWorld({ toggleWorks: true });
    const res = await deleteOne(w, "card-42");
    assert.strictEqual(res.ok, true, `expected ok, got ${JSON.stringify(res)}`);
    assert.strictEqual(res.cardId, "card-42", "result does not name the Card Identity");
  },
});

// Refusal: the state never changes, failure is named not retried.
tests.push({
  name: "reaction not removed reports a named refusal, cardState unchanged",
  fn: async () => {
    const w = makeReactionWorld({ toggleWorks: false });
    const res = await deleteOne(w, "card-42");
    assert.strictEqual(res.ok, false, "expected failure");
    assert.ok(/refused/i.test(res.error), `error does not name the refusal: ${res.error}`);
    assert.strictEqual(res.cardId, "card-42");
  },
});

// Unknown card: named not-found, not an exception.
tests.push({
  name: "an unknown Card Identity returns a not-found result, not a throw",
  fn: async () => {
    const w = makeReactionWorld();
    const res = await deleteOne(w, "no-such-card");
    assert.strictEqual(res.ok, false);
    assert.ok(/not.?found/i.test(res.error), `error does not say not found: ${res.error}`);
    assert.strictEqual(res.cardId, "no-such-card");
  },
});

// Source hygiene: the list-shaped first-eligible operation is gone.
tests.push({
  name: "the list-shaped deleteFirstEligible is gone from the source",
  fn: async () => {
    assert.ok(!src.includes("deleteFirstEligible"), "deleteFirstEligible still present");
  },
});

tests.push({
  name: "window.LP exposes deleteOneCard and not deleteFirstEligible",
  fn: async () => {
    const w = makeReactionWorld();
    assert.equal(typeof w.window.LP.deleteOneCard, "function");
    assert.equal(w.window.LP.deleteFirstEligible, undefined);
  },
});

async function main() {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`PASS: ${t.name}`);
    } catch (e) {
      console.error(`FAIL: ${t.name} - ${e.message}`);
      failed++;
    }
  }
  console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main();
