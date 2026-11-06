// Purge status vocabulary, finality, and transition rules.
// `deleted` is final; `todo`, `failed` and `not-found` are retried;
// `no-op` is never acted on. One module owns these rules so the runner and
// the status command cannot invent a status the page does not understand.

export const PURGE_STATUSES = {
  NO_OP: "no-op",
  TODO: "todo",
  DELETED: "deleted",
  FAILED: "failed",
  NOT_FOUND: "not-found",
};

const { NO_OP, TODO, DELETED, FAILED, NOT_FOUND } = PURGE_STATUSES;

// Statuses a purge may act on: everything except the final one (`deleted`)
// and the never-touched one (`no-op`), which are excluded for different
// reasons (finality vs. not selected).
export const ACTIONABLE_STATUSES = new Set([TODO, FAILED, NOT_FOUND]);
export const RETRYABLE_STATUSES = ACTIONABLE_STATUSES;
export const FINAL_STATUSES = new Set([DELETED]);

export function isFinalStatus(status) {
  return status === DELETED;
}

export function isNoOp(status) {
  return status === NO_OP;
}

export function isActionable(status) {
  return ACTIONABLE_STATUSES.has(status);
}

// Transition attempt outcomes always resolve to exactly one of these three.
const OUTCOME_ALIASES = {
  deleted: DELETED,
  success: DELETED,
  ok: DELETED,
  true: DELETED,
  done: DELETED,
  acted: DELETED,
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
  if (/success|deleted|ok|done|acted/.test(key)) return DELETED;
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
    if (typeof o.status === "string" && (o.status === DELETED || o.status === FAILED || o.status === NOT_FOUND)) {
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
      o.acted === true ||
      o.done === true
    ) {
      return DELETED;
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
    return success ? DELETED : FAILED;
  }

  if (typeof input === "string") return mapOutcomeString(input);
  if (typeof input === "boolean") {
    const foundArg = rest.find((v) => typeof v === "boolean");
    if (input === true) {
      if (foundArg === false) return NOT_FOUND;
      return DELETED;
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
  if (from === DELETED) return to === DELETED;
  if (from === NO_OP) return to === NO_OP || to === TODO;
  if (from === TODO || from === FAILED || from === NOT_FOUND) {
    return to === DELETED || to === FAILED || to === NOT_FOUND;
  }
  return false;
}

export const STATUS_TRANSITIONS = {
  [NO_OP]: "skip",
  [TODO]: "act",
  [DELETED]: "final",
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