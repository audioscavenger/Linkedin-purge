// Purge status vocabulary, finality, and transition rules.
// `purged` is final; `pending`, `failed` and `not-found` are retried;
// `no-op` is never acted on. One module owns these rules so the runner and
// the status command cannot invent a status the page does not understand.

export const PURGE_STATUSES = {
  NO_OP: "no-op",
  PENDING: "pending",
  PURGED: "purged",
  FAILED: "failed",
  NOT_FOUND: "not-found",
};

const { NO_OP, PENDING, PURGED, FAILED, NOT_FOUND } = PURGE_STATUSES;

// Statuses a purge may act on: everything except the final one (`purged`)
// and the never-touched one (`no-op`), which are excluded for different
// reasons (finality vs. not selected).
export const ACTIONABLE_STATUSES = new Set([PENDING, FAILED, NOT_FOUND]);
export const RETRYABLE_STATUSES = ACTIONABLE_STATUSES;
export const FINAL_STATUSES = new Set([PURGED]);

export function isFinalStatus(status) {
  return status === PURGED;
}

export function isNoOp(status) {
  return status === NO_OP;
}

export function isActionable(status) {
  return ACTIONABLE_STATUSES.has(status);
}

// Transition attempt outcomes always resolve to exactly one of these three.
const OUTCOME_ALIASES = {
  purged: PURGED,
  success: PURGED,
  ok: PURGED,
  true: PURGED,
  deleted: PURGED,
  done: PURGED,
  acted: PURGED,
  "not-found": NOT_FOUND,
  notfound: NOT_FOUND,
  "not_found": NOT_FOUND,
  "not found": NOT_FOUND,
  missing: NOT_FOUND,
  unmatched: NOT_FOUND,
  failed: FAILED,
  failure: FAILED,
  refused: FAILED,
  error: FAILED,
  false: FAILED,
};

function mapOutcomeString(value) {
  const key = String(value).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(OUTCOME_ALIASES, key)) {
    return OUTCOME_ALIASES[key];
  }
  if (/not.?found|missing|unmatched/.test(key)) return NOT_FOUND;
  if (/refus|fail|error/.test(key)) return FAILED;
  if (/success|purged|deleted|ok|done|acted/.test(key)) return PURGED;
  return FAILED;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function outcomeToStatus(input, ...rest) {
  // Object form: read structured fields.
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const o = input;
    if (typeof o.outcome === "string") return mapOutcomeString(o.outcome);
    if (typeof o.result === "string") return mapOutcomeString(o.result);
    if (typeof o.status === "string" && (o.status === PURGED || o.status === FAILED || o.status === NOT_FOUND)) {
      return o.status;
    }
    if (
      o.notFound === true ||
      o.found === false ||
      o.exists === false ||
      o.matched === false ||
      o.missing === true
    ) {
      return NOT_FOUND;
    }
    if (
      o.ok === true ||
      o.success === true ||
      o.deleted === true ||
      o.purged === true ||
      o.acted === true ||
      o.done === true
    ) {
      return PURGED;
    }
    if (
      o.ok === false ||
      o.success === false ||
      o.refused === true ||
      o.failed === true ||
      o.error != null
    ) {
      return FAILED;
    }
    if (typeof o.reason === "string") return mapOutcomeString(o.reason);
  }

  // Two-or-more positional booleans: (success, found).
  if (rest.length > 0 && typeof rest[0] === "boolean") {
    const success = !!input;
    const found = rest[0];
    if (!found) return NOT_FOUND;
    return success ? PURGED : FAILED;
  }

  if (typeof input === "string") return mapOutcomeString(input);
  if (typeof input === "boolean") {
    const foundArg = rest.find((v) => typeof v === "boolean");
    if (input === true) {
      if (foundArg === false) return NOT_FOUND;
      return PURGED;
    }
    if (foundArg === false) return NOT_FOUND;
    return FAILED;
  }
  if (input == null) {
    const foundArg = rest.find((v) => typeof v === "boolean");
    if (foundArg === false) return NOT_FOUND;
    return FAILED;
  }
  return FAILED;
}

export function transitionStatus(status, outcome, ...rest) {
  if (!isActionable(status)) return status;
  return outcomeToStatus(outcome, ...rest);
}

export function isLegalTransition(from, to) {
  if (from === PURGED) return to === PURGED;
  if (from === NO_OP) return to === NO_OP || to === PENDING;
  if (from === PENDING || from === FAILED || from === NOT_FOUND) {
    return to === PURGED || to === FAILED || to === NOT_FOUND;
  }
  return false;
}

export const STATUS_TRANSITIONS = {
  [NO_OP]: "skip",
  [PENDING]: "act",
  [PURGED]: "final",
  [FAILED]: "retry",
  [NOT_FOUND]: "retry",
};

export const TRANSITIONS = STATUS_TRANSITIONS;
export const PURGE_ACTION_BY_STATUS = STATUS_TRANSITIONS;
export const ACTION_BY_STATUS = STATUS_TRANSITIONS;

// Default export for callers that import the module as a namespace object.
export default {
  PURGE_STATUSES,
  ACTIONABLE_STATUSES,
  RETRYABLE_STATUSES,
  FINAL_STATUSES,
  isFinalStatus,
  isNoOp,
  isActionable,
  outcomeToStatus,
  transitionStatus,
  isLegalTransition,
  STATUS_TRANSITIONS,
  TRANSITIONS,
  PURGE_ACTION_BY_STATUS,
  ACTION_BY_STATUS,
};