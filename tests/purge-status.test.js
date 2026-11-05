// Tests the purge status vocabulary module.
import assert from "node:assert";
import {
  PURGE_STATUSES,
  isFinalStatus,
  isNoOp,
  isActionable,
  outcomeToStatus,
  transitionStatus,
  isLegalTransition,
  ACTIONABLE_STATUSES,
  STATUS_TRANSITIONS,
} from "../src/purge/status.js";

assert.deepStrictEqual(
  PURGE_STATUSES,
  {
    NO_OP: "no-op",
    PENDING: "pending",
    PURGED: "purged",
    FAILED: "failed",
    NOT_FOUND: "not-found",
  },
  "PURGE_STATUSES must match the exact five values"
);

// Finality: only purged.
assert.strictEqual(isFinalStatus("purged"), true, "purged is final");
for (const s of ["no-op", "pending", "failed", "not-found"]) {
  assert.strictEqual(isFinalStatus(s), false, `${s} is not final`);
}

// no-op is never acted on.
assert.strictEqual(isNoOp("no-op"), true, "no-op is no-op");
for (const s of ["pending", "purged", "failed", "not-found"]) {
  assert.strictEqual(isNoOp(s), false, `${s} is not no-op`);
}

// Actionable: pending, failed, not-found only; purged and no-op excluded.
const actionable = ["pending", "failed", "not-found"];
const notActionable = ["purged", "no-op"];
for (const s of actionable) {
  assert.strictEqual(isActionable(s), true, `${s} may be acted on`);
}
for (const s of notActionable) {
  assert.strictEqual(isActionable(s), false, `${s} may not be acted on`);
}
assert.deepStrictEqual(
  [...ACTIONABLE_STATUSES].sort(),
  actionable.sort(),
  "ACTIONABLE_STATUSES must list exactly the actionable statuses"
);

// Every status pinned against the transition rules.
for (const s of Object.values(PURGE_STATUSES)) {
  const mayAct = isActionable(s);
  if (s === "purged" || s === "no-op") {
    assert.strictEqual(mayAct, false, `${s} is not actionable`);
  } else {
    assert.strictEqual(mayAct, true, `${s} is actionable`);
  }
}

// Attempt outcomes map to exactly one of purged, failed, not-found.
assert.strictEqual(outcomeToStatus(true), "purged", "success maps to purged");
assert.strictEqual(outcomeToStatus(false), "failed", "failure maps to failed");
assert.strictEqual(outcomeToStatus("not-found"), "not-found", "not-found maps to not-found");
assert.strictEqual(outcomeToStatus("success"), "purged");
assert.strictEqual(outcomeToStatus("refused"), "failed");
assert.strictEqual(outcomeToStatus({ ok: true }), "purged");
assert.strictEqual(outcomeToStatus({ ok: false }), "failed");
assert.strictEqual(outcomeToStatus({ found: false }), "not-found");
assert.strictEqual(outcomeToStatus(true, false), "not-found");

// transitionStatus respects finality / no-op.
assert.strictEqual(transitionStatus("purged", true), "purged", "purged stays purged");
assert.strictEqual(transitionStatus("no-op", true), "no-op", "no-op stays no-op");
assert.strictEqual(transitionStatus("pending", true), "purged");
assert.strictEqual(transitionStatus("failed", false), "failed");
assert.strictEqual(transitionStatus("not-found", "not-found"), "not-found");

// Legal transitions.
assert.strictEqual(isLegalTransition("purged", "purged"), true);
assert.strictEqual(isLegalTransition("purged", "failed"), false);
assert.strictEqual(isLegalTransition("pending", "purged"), true);
assert.strictEqual(isLegalTransition("no-op", "pending"), true);

// STATUS_TRANSITIONS covers every status.
for (const s of Object.values(PURGE_STATUSES)) {
  assert.ok(Object.prototype.hasOwnProperty.call(STATUS_TRANSITIONS, s), `STATUS_TRANSITIONS missing ${s}`);
}

console.log("purge-status.test.js passed successfully!");