// Core PurgeRunner logic

import { PURGE_STATUSES } from "./status.js";

export class PurgeRunner {
  constructor({
    pageAdapter,
    confirmAdapter,
    // Selection runs persist statuses straight into the selection envelope
    // through the store (src/envelope-store.js), so an interrupted run keeps
    // every status earned so far.
    envelopeStore,
  }) {
    this.pageAdapter = pageAdapter;
    this.confirmAdapter = confirmAdapter;
    this.envelopeStore = envelopeStore || null;
  }

  async run(options = {}) {
    const startTime = Date.now();
    const type = options.type || "comments";
    const timeoutMs = options.timeoutMs || 3600000;
    const batchSize = options.batchSize || 10;
    const backoffBase = options.backoffBase || 10000;
    // Optional: restrict deletion to a specific set of keys (from --input file).
    const inputKeys = options.inputKeys ? new Set(options.inputKeys) : null;
    // The selection branch fills this with per-status counts.
    let summaryCounts = null;

    if (inputKeys) {
      // Selection mode (tickets 19 & 20): act on the selected items that are
      // not already final, and stop the moment every selected item is dealt
      // with. The runner holds no writable state of its own; each result is
      // stamped with the status vocabulary:
      // success -> purged, refusal -> failed, no card left -> not-found.
      // Failed and not-found are retried on the next run; purged and no-op
      // are never acted on again.
      const prior = this.envelopeStore ? await this.envelopeStore.load(type) : null;
      const priorStatus = new Map();
      if (prior && Array.isArray(prior.items)) {
        for (const it of prior.items) {
          if (it && it.cardId) priorStatus.set(it.cardId, it.status);
          else if (it && it.key) priorStatus.set(it.key, it.status);
        }
      }
      const counts = { purged: 0, failed: 0, notFound: 0, noOp: 0 };
      let deleted = 0;
      // Only items that are not already final are actionable. Already-final
      // items (`purged`, `no-op`) are counted as no-op but not acted on.
      const actionable = [];
      for (const k of options.inputKeys) {
        const st = priorStatus.get(k);
        if (st === PURGE_STATUSES.PURGED || st === PURGE_STATUSES.NO_OP) {
          counts.noOp++;
        } else {
          actionable.push(k);
        }
      }
      if (actionable.length === 0) {
        return { type, deleted: 0, durationMs: Date.now() - startTime, counts };
      }
      const confirmed = await this.confirmAdapter.confirm(
        `Delete ${actionable.length} ${type} items? Type YES to proceed: `
      );
      if (!confirmed) {
        return { type, deleted: 0, durationMs: Date.now() - startTime, counts };
      }
      for (const key of actionable) {
        const result = await this.pageAdapter.oneCardAct(key);

        if (result && result.ok) {
          // Success: mark `purged` through the store.
          deleted++;
          counts.purged++;
          if (this.envelopeStore) await this.envelopeStore.mark(key, PURGE_STATUSES.PURGED);
        } else {
          const err = (result && result.error) || "";
          // A card that is not on the page is `not-found`, reported by
          // identity; anything else (refused, rate limit) is `failed`. Both
          // are retried on the next run, and neither is final.
          const notFound = /not.?found/i.test(err);
          if (notFound) counts.notFound++;
          else counts.failed++;
          if (this.envelopeStore) {
            await this.envelopeStore.mark(key, notFound ? PURGE_STATUSES.NOT_FOUND : PURGE_STATUSES.FAILED);
          }
        }
      }
      summaryCounts = counts;
      return {
        type,
        deleted,
        durationMs: Date.now() - startTime,
        counts: summaryCounts,
      };
    }

    // Full purge mode (no selection): walk the Activity List and act on every
    // collected card by its identity. No checkpoint and no report are kept -
    // both were retired in 0.5.0 (tickets 23/24). Processed keys are tracked
    // in memory only for this run, so a card is never acted on twice within a
    // single run.
    const processedLocally = new Set();
    let deleted = 0;
    let emptyScrolls = 0;
    const purgeStart = Date.now();
    let confirmed = false;
    while (true) {
      if (timeoutMs > 0 && Date.now() - purgeStart > timeoutMs) break;
      const keys = await this.pageAdapter.collectKeys();
      const newKeys = keys.filter((k) => !processedLocally.has(k));
      if (newKeys.length === 0) {
        emptyScrolls++;
        if (emptyScrolls >= (options.maxEmptyScrolls || 8)) break;
        await this.pageAdapter.waitForTimeout(1200);
        continue;
      }
      emptyScrolls = 0;
      // Confirm once, on the first batch of work.
      if (!confirmed) {
        const ok = await this.confirmAdapter.confirm(
          `Delete ${newKeys.length} ${type} items? Type YES to proceed: `
        );
        if (!ok) {
          return { type, deleted: 0, durationMs: Date.now() - startTime, counts: null };
        }
        confirmed = true;
      }
      let roundCount = 0;
      for (const key of newKeys) {
        processedLocally.add(key);
        const result = await this.pageAdapter.oneCardAct(key);
        if (result && result.ok) deleted++;
        roundCount++;
        if (roundCount % batchSize === 0) {
          const pause = Math.floor(Math.random() * (options.batchMax - options.batchMin + 1)) + options.batchMin;
          await this.pageAdapter.waitForTimeout(pause);
        }
      }
    }

    return {
      type,
      deleted,
      durationMs: Date.now() - startTime,
      counts: null,
    };
  }
}
