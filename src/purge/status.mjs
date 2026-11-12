/*
  Purge status vocabulary, finality, and transition rules.
  `deleted` is final; `todo`, `failed` and `not-found` are retried;
  `no-op` is never acted on. One module owns these rules so the runner and
  the status command cannot invent a status the page does not understand.
*/

export const PURGE_STATUSES = {
  NO_OP: "no-op",
  TODO: "todo",
  DELETED: "deleted",
  FAILED: "failed",
  NOT_FOUND: "not-found",
};

const { NO_OP, TODO, DELETED, FAILED, NOT_FOUND } = PURGE_STATUSES;

/*
  Statuses a purge may act on: everything except the final one (`deleted`)
  and the never-touched one (`no-op`), which are excluded for different
  reasons (finality vs. not selected).
*/
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
  not_found: NOT_FOUND,
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

/**
 * Map an outcome object to a purge status.
 * @param {{ ok?: boolean, found?: boolean, status?: string, outcome?: string, result?: string, reason?: string, error?: any }} input - Outcome object.
 * @returns {string} A purge status (deleted, failed, or not-found).
 */
export function outcomeToStatus(input) {
  // Only the object form is accepted. Non-objects return FAILED.
  if (
    input === null ||
    (input.constructor !== Object && input.constructor !== Array) ||
    Array.isArray(input)
  ) {
    return FAILED;
  }

  const o = input;

  if (o.outcome?.constructor === String) return mapOutcomeString(o.outcome);

  if (o.result?.constructor === String) return mapOutcomeString(o.result);

  if (
    o.status?.constructor === String &&
    (o.status === DELETED || o.status === FAILED || o.status === NOT_FOUND)
  ) {
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

  if (o.reason?.constructor === String) return mapOutcomeString(o.reason);

  return FAILED;
}

export function transitionStatus(status, outcome) {
  if (!isActionable(status)) return status;

  return outcomeToStatus(outcome);
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
