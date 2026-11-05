// Tests the purge status vocabulary module.
import assert from "node:assert";
import { PURGE_STATUSES, isFinalStatus } from "../src/purge/status.js";

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

assert.strictEqual(isFinalStatus("purged"), true, "purged is final");
assert.strictEqual(isFinalStatus("no-op"), false, "no-op is not final");
assert.strictEqual(isFinalStatus("pending"), false, "pending is not final");
assert.strictEqual(isFinalStatus("failed"), false, "failed is not final");
assert.strictEqual(isFinalStatus("not-found"), false, "not-found is not final");

console.log("purge-status.test.js passed successfully!");
