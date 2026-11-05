// Core PurgeRunner logic

import fs from "node:fs";
import { PURGE_STATUSES } from "./status.js";

export class PurgeRunner {
  constructor({
    pageAdapter,
    checkpointAdapter,
    reporterAdapter,
    confirmAdapter,
    // Selection runs persist statuses straight into the selection envelope
    // through the store (src/envelope-store.js), so an interrupted run keeps
    // every status earned so far.
    envelopeStore,
  }) {
    this.pageAdapter = pageAdapter;
    this.checkpointAdapter = checkpointAdapter;
    this.reporterAdapter = reporterAdapter;
    this.confirmAdapter = confirmAdapter;
    this.envelopeStore = envelopeStore || null;
  }

  async run(options = {}) {
    const startTime = Date.now();
    const type = options.type || "comments";
    const timeoutMs = options.timeoutMs || 3600000;
    const batchSize = options.batchSize || 10;
    const maxRetries = options.maxRetries || 4;
    const backoffBase = options.backoffBase || 10000;
    // Optional: restrict deletion to a specific set of keys (from --input file).
    const inputKeys = options.inputKeys ? new Set(options.inputKeys) : null;
    // The selection branch fills this with per-status counts; the full-purge
    // branch leaves it null (its entries carry reaction states, not statuses).
    let summaryCounts = null;

    // Both seams are optional. The legacy full-purge flow wires them (they
    // are being retired in tickets 23/24); a selection run wires neither and
    // records statuses through the envelope store alone.
    const checkpoint = this.checkpointAdapter || {
      load: async () => ({ processed: new Set() }),
      save: async () => {},
      add: async () => {},
    };
    const reporter = this.reporterAdapter || {
      open: async () => {},
      write: async () => {},
      close: async () => null,
    };

    // Load existing checkpoint
    const cpResult = await checkpoint.load();
    const processedSet = cpResult.processed;

    // The eligibility rule lives only here (single-sited): a key is eligible
    // if it's not already processed (checkpoint) AND (if inputKeys is set) it's
    // in inputKeys. The runner computes the eligible list and hands it to the
    // page adapter, which does a plain membership test over the passed list.
    const eligible = (k) => !processedSet.has(k) && (!inputKeys || inputKeys.has(k));

    // Collect keys and filter by checkpoint + input. A selection is matched by
    // Card Identity, which page.collect() cannot see (it yields session keys),
    // so a selection's pending count is its own size, not a page intersection.
    const keys = await this.pageAdapter.collectKeys();
    const pendingCount = inputKeys ? inputKeys.size : keys.filter(eligible).length;

    if (pendingCount === 0) {
      // Nothing to do
      await reporter.open(type);
      const reportPath = await reporter.close();
      return {
        type,
        deleted: 0,
        processed: processedSet.size,
        durationMs: Date.now() - startTime,
        reportPath,
      };
    }

    const confirmed = await this.confirmAdapter.confirm(
      `Delete ${pendingCount} ${type} items? Type YES to proceed: `
    );
    if (!confirmed) {
      await reporter.open(type);
      const reportPath = await reporter.close();
      return { type, deleted: 0, processed: processedSet.size, durationMs: Date.now() - startTime, reportPath };
    }

    // Initialize report
    await reporter.open(type);

    let deleted = 0;

    if (inputKeys) {
      // Selection mode (tickets 19 & 20): act on the selected items that are
      // not already purged, and stop the moment every selected item is dealt
      // with. The runner holds no writable state of its own; each result is
      // handed to the reporter, which stamps it with the status vocabulary:
      // success -> purged, refusal -> failed, no card left -> not-found.
      // Only purged keys enter the checkpoint, so failed and not-found are
      // retried on a re-run while purged keys are skipped and no-op keys
      // (anything not selected) are never touched.
      const counts = { purged: 0, failed: 0, notFound: 0, noOp: 0 };
      for (const key of options.inputKeys) {
        // Checkpoint-processed keys are already final (purged): keep them no-op.
        if (processedSet.has(key)) {
          counts.noOp++;
          continue;
        }

        const result = await this.pageAdapter.oneCardAct(key);

        if (result && result.ok) {
          // Success: write `purged` through the store.
          deleted++;
          counts.purged++;
          processedSet.add(key);
          if (this.envelopeStore) await this.envelopeStore.mark(key, PURGE_STATUSES.PURGED);
          await reporter.write({
            key: result.key,
            state: PURGE_STATUSES.PURGED,
            author: result.author,
            postHref: result.postHref,
            dateTime: result.dateTime,
          });
        } else {
          const err = (result && result.error) || "";
          // A card that is not on the page is `not-found`, reported by identity;
          // anything else (refused, rate limit) is `failed`. Both are retried
          // on the next run, and neither enters the checkpoint.
          const notFound = /not.?found/i.test(err);
          if (notFound) counts.notFound++;
          else counts.failed++;
          if (this.envelopeStore) {
            await this.envelopeStore.mark(key, notFound ? PURGE_STATUSES.NOT_FOUND : PURGE_STATUSES.FAILED);
          }
          await reporter.write({
            key: result && result.cardId ? result.cardId : key,
            state: notFound ? PURGE_STATUSES.NOT_FOUND : PURGE_STATUSES.FAILED,
            author: null,
            postHref: null,
            dateTime: null,
          });
        }
      }
      summaryCounts = counts;
    } else {
      let retries = 0;
      let emptyScrolls = 0;
      const purgeStart = Date.now();

      while (true) {
        // Timeout check
        if (timeoutMs > 0 && Date.now() - purgeStart > timeoutMs) {
          break;
        }

        const keys = await this.pageAdapter.collectKeys();
        // Eligible list for this round: the runner's rule applied to the keys
        // currently on the page, already excluding checkpoint-processed and
        // (when given) non-input keys.
        const eligibleKeys = keys.filter(eligible);

        if (eligibleKeys.length === 0) {
          emptyScrolls++;
          if (emptyScrolls >= (options.maxEmptyScrolls || 8)) {
            break;
          }
          await this.pageAdapter.waitForTimeout(1200);
          continue;
        }
        emptyScrolls = 0;

        // Eligibility is decided above (the runner's only copy of the rule);
        // the adapter receives the precomputed list and checks membership only.
        const result = await this.pageAdapter.deleteFirstEligible(eligibleKeys);

        if (result && result.ok) {
          deleted++;
          retries = 0;
          processedSet.add(result.key);
          // The runner only hands over the Purge Item's fields as the page
          // adapter returned them. The reporter owns the Report Entry: it stamps
          // ts itself and builds the canonical field set at the writer seam, so
          // no null-normalization or timestamp lives here.
          await reporter.write({
            key: result.key,
            state: result.state,
            author: result.author,
            postHref: result.postHref,
            dateTime: result.dateTime,
          });

          if (deleted % batchSize === 0) {
            await checkpoint.save();
          }

          if (deleted % batchSize === 0) {
            const pause = Math.floor(Math.random() * (options.batchMax - options.batchMin + 1)) + options.batchMin;
            await this.pageAdapter.waitForTimeout(pause);
          } else {
            const actionMin = options.actionMin || 2000;
            const actionMax = options.actionMax || 5000;
            const pause = Math.floor(Math.random() * (actionMax - actionMin + 1)) + actionMin;
            await this.pageAdapter.waitForTimeout(pause);
          }
        } else {
          // No eligible item right now — treat as empty scroll iteration
          retries = 0;
          emptyScrolls++;
          if (emptyScrolls >= (options.maxEmptyScrolls || 8)) {
            break;
          }
          await this.pageAdapter.waitForTimeout(1200);
        }
      }
    }

    // Final save and close
    await checkpoint.save();
    const reportPath = await reporter.close();

    return {
      type,
      deleted,
      processed: processedSet.size,
      durationMs: Date.now() - startTime,
      reportPath,
      counts: summaryCounts,
    };
  }
}
