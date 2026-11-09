// Core PurgeRunner logic

import { PURGE_STATUSES, isFinalStatus, outcomeToStatus } from "./status.mjs";
import { warn } from "../logger.mjs";

export class PurgeRunner {
  constructor({ pageAdapter, confirmAdapter, envelopeStore }) {
    this.pageAdapter = pageAdapter;
    this.confirmAdapter = confirmAdapter;
    this.envelopeStore = envelopeStore || null;
  }

  async run(options = {}) {
    const startTime = Date.now();
    const type = options.type || "comments";
    const timeoutMs = options.timeoutMs || 3600000;
    const batchSize = options.batchSize || 10;
    // Optional: restrict deletion to a specific set of keys (from --input file).
    const inputKeys = options.inputKeys ? new Set(options.inputKeys) : null;
    // The selection branch fills this with per-status counts.

    if (inputKeys) {
      // Selection mode (tickets 18/19/30): walk the Activity List via loadStep,
      // match cards by Card Identity, stop when every selected item is final.
      const prior = this.envelopeStore
        ? await this.envelopeStore.load(type)
        : null;
      const priorStatus = new Map();

      // Use the selection items' statuses when provided (they carry "todo"
      // from the Export stamp); fall back to the scan envelope otherwise.
      if (options.selectionStatusMap) {
        for (const [id, st] of options.selectionStatusMap) {
          priorStatus.set(id, st);
        }
      } else if (prior && Array.isArray(prior.items)) {
        for (const it of prior.items) {
          if (it && it.cardId) priorStatus.set(it.cardId, it.status);
          else if (it && it.key) priorStatus.set(it.key, it.status);
        }
      }
      const counts = { deleted: 0, failed: 0, notFound: 0, noOp: 0 };
      let deleted = 0;

      // Build the set of selected cardIds that are not yet final.
      // Already-final items (`deleted`, `no-op`) are counted as no-op but not acted on.
      const remaining = new Set();
      for (const key of options.inputKeys) {
        const st = priorStatus.get(key);
        if (isFinalStatus(st) || st === PURGE_STATUSES.NO_OP) {
          counts.noOp++;
        } else {
          remaining.add(key);
        }
      }
      if (remaining.size === 0) {
        return { type, deleted: 0, durationMs: Date.now() - startTime, counts };
      }

      // Confirm once with the actionable count.
      const confirmed = await this.confirmAdapter.confirm(
        `Delete ${remaining.size} ${type} items? Type YES to proceed: `
      );
      if (!confirmed) {
        return { type, deleted: 0, durationMs: Date.now() - startTime, counts };
      }

      // Walk the Activity List via loadStep (scroll-and-poll).
      let emptySteps = 0;
      const maxEmptySteps = options.maxEmptyScrolls || 8;

      while (remaining.size > 0) {
        if (timeoutMs > 0 && Date.now() - startTime > timeoutMs) break;

        const cardIds = await this.pageAdapter.collectCardIds();

        // For each card on the current page that is in remaining, act on it.
        let actedThisStep = false;
        for (const cardId of cardIds) {
          if (!remaining.has(cardId)) continue;
          if (actedThisStep && remaining.size === 0) break;

          const result = await this.pageAdapter.oneCardAct(cardId);
          const status = outcomeToStatus(result?.ok ?? false, result?.error);
          remaining.delete(cardId);

          if (status === PURGE_STATUSES.DELETED) {
            deleted++;
            counts.deleted++;
          } else if (status === PURGE_STATUSES.NOT_FOUND) {
            counts.notFound++;
          } else {
            counts.failed++;
          }

          if (this.envelopeStore) {
            try {
              await this.envelopeStore.mark(cardId, status);
            } catch (err) {
              warn(`Could not persist status for ${cardId}: ${err.message}`);
            }
          }

          actedThisStep = true;

          // Stop early if all selected items are dealt with.
          if (remaining.size === 0) break;
        }

        if (remaining.size === 0) break;

        // If no new cards were acted on this step, check if we've exhausted the list.
        if (!actedThisStep) {
          emptySteps++;
          if (emptySteps >= maxEmptySteps) {
            // List exhausted: mark any remaining selected items as not-found.
            for (const cardId of remaining) {
              counts.notFound++;
              if (this.envelopeStore) {
                try {
                  await this.envelopeStore.mark(
                    cardId,
                    PURGE_STATUSES.NOT_FOUND
                  );
                } catch (err) {
                  warn(
                    `Could not persist not-found for ${cardId}: ${err.message}`
                  );
                }
              }
            }
            remaining.clear();
            break;
          }
        } else {
          emptySteps = 0;
        }

        // Load the next step (scroll and wait for new cards).
        await this.pageAdapter.loadStep();
        await this.pageAdapter.wait(1200);
      }

      return {
        type,
        deleted,
        durationMs: Date.now() - startTime,
        counts,
      };
    }

    /*
  Full purge mode (no selection): walk the Activity List and act on every
  collected card by its Card Identity (container element id). Statuses are
  persisted through envelopeStore (same as selection mode). Processed cardIds
  are tracked in memory only for this run, so a card is never acted on twice
  within a single run.
*/
    const processedLocally = new Set();
    let deleted = 0;
    let emptyScrolls = 0;
    const purgeStart = Date.now();
    let confirmed = false;
    while (true) {
      if (timeoutMs > 0 && Date.now() - purgeStart > timeoutMs) break;
      const cardIds = await this.pageAdapter.collectCardIds();
      const newCardIds = cardIds.filter((id) => !processedLocally.has(id));
      if (newCardIds.length === 0) {
        emptyScrolls++;
        if (emptyScrolls >= (options.maxEmptyScrolls || 8)) break;
        await this.pageAdapter.wait(1200);
        continue;
      }
      emptyScrolls = 0;
      // Confirm once, on the first batch of work.
      if (!confirmed) {
        const ok = await this.confirmAdapter.confirm(
          `Delete ${newCardIds.length} ${type} items? Type YES to proceed: `
        );
        if (!ok) {
          return {
            type,
            deleted: 0,
            durationMs: Date.now() - startTime,
            counts: null,
          };
        }
        confirmed = true;
      }
      let roundCount = 0;
      for (const cardId of newCardIds) {
        processedLocally.add(cardId);
        const result = await this.pageAdapter.oneCardAct(cardId);
        const status = outcomeToStatus(result?.ok ?? false, result?.error);
        if (status === PURGE_STATUSES.DELETED) {
          deleted++;
          // Best-effort: a missing scan envelope (e.g. purge without a prior
          // scan) must not crash the run.
          if (this.envelopeStore) {
            try {
              await this.envelopeStore.mark(cardId, PURGE_STATUSES.DELETED);
            } catch (err) {
              warn(
                `Could not persist deleted status for ${cardId}: ${err.message}`
              );
            }
          }
        } else if (this.envelopeStore) {
          try {
            await this.envelopeStore.mark(cardId, status);
          } catch (err2) {
            warn(`Could not persist status for ${cardId}: ${err2.message}`);
          }
        }
        roundCount++;
        if (roundCount % batchSize === 0) {
          const pause =
            Math.floor(
              Math.random() * (options.batchMax - options.batchMin + 1)
            ) + options.batchMin;
          await this.pageAdapter.wait(pause);
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
