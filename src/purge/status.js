// Purge status vocabulary and finality check.
export const PURGE_STATUSES = {
  NO_OP: "no-op",
  PENDING: "pending",
  PURGED: "purged",
  FAILED: "failed",
  NOT_FOUND: "not-found",
};

export function isFinalStatus(status) {
  return status === PURGE_STATUSES.PURGED;
}
