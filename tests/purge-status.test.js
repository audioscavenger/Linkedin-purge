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
    TODO: "todo",
    DELETED: "deleted",
    FAILED: "failed",
    NOT_FOUND: "not-found",
  },
  "PURGE_STATUSES must match the exact five values"
);

// Finality: only deleted.
assert.strictEqual(isFinalStatus("deleted"), true, "deleted is final");
for (const s of ["no-op", "todo", "failed", "not-found"]) {
  assert.strictEqual(isFinalStatus(s), false, `${s} is not final`);
}

// no-op is never acted on.
assert.strictEqual(isNoOp("no-op"), true, "no-op is no-op");
for (const s of ["todo", "deleted", "failed", "not-found"]) {
  assert.strictEqual(isNoOp(s), false, `${s} is not no-op`);
}

// Actionable: todo, failed, not-found only; deleted and no-op excluded.
const actionable = ["todo", "failed", "not-found"];
const notActionable = ["deleted", "no-op"];
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
  if (s === "deleted" || s === "no-op") {
    assert.strictEqual(mayAct, false, `${s} is not actionable`);
  } else {
    assert.strictEqual(mayAct, true, `${s} is actionable`);
  }
}

// Attempt outcomes map to exactly one of deleted, failed, not-found.
assert.strictEqual(outcomeToStatus(true), "deleted", "success maps to deleted");
assert.strictEqual(outcomeToStatus(false), "failed", "failure maps to failed");
assert.strictEqual(
  outcomeToStatus("not-found"),
  "not-found",
  "not-found maps to not-found"
);
assert.strictEqual(outcomeToStatus("success"), "deleted");
assert.strictEqual(outcomeToStatus("refused"), "failed");
assert.strictEqual(outcomeToStatus({ ok: true }), "deleted");
assert.strictEqual(outcomeToStatus({ ok: false }), "failed");
assert.strictEqual(outcomeToStatus({ found: false }), "not-found");
assert.strictEqual(outcomeToStatus(true, false), "not-found");

// transitionStatus respects finality / no-op.
assert.strictEqual(
  transitionStatus("deleted", true),
  "deleted",
  "deleted stays deleted"
);
assert.strictEqual(
  transitionStatus("no-op", true),
  "no-op",
  "no-op stays no-op"
);
assert.strictEqual(transitionStatus("todo", true), "deleted");
assert.strictEqual(transitionStatus("failed", false), "failed");
assert.strictEqual(transitionStatus("not-found", "not-found"), "not-found");

// Legal transitions.
assert.strictEqual(isLegalTransition("deleted", "deleted"), true);
assert.strictEqual(isLegalTransition("deleted", "failed"), false);
assert.strictEqual(isLegalTransition("todo", "deleted"), true);
assert.strictEqual(isLegalTransition("no-op", "todo"), true);

// STATUS_TRANSITIONS covers every status.
for (const s of Object.values(PURGE_STATUSES)) {
  assert.ok(
    Object.prototype.hasOwnProperty.call(STATUS_TRANSITIONS, s),
    `STATUS_TRANSITIONS missing ${s}`
  );
}

console.log("purge-status.test.js passed successfully!");
