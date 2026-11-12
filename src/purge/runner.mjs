// Core PurgeRunner logic

import { PURGE_STATUSES, isFinalStatus, outcomeToStatus } from "./status.mjs";
import { warn } from "../logger.mjs";

export class PurgeRunner {
  constructor({ pageAdapter, confirmAdapter, envelopeStore }) {
    this.pageAdapter = pageAdapter;
    this.confirmAdapter = confirmAdapter;
    this.envelopeStore = envelopeStore || null;
  }

  /**
   * Thin dispatcher: routes to runSelection or runFull based on inputKeys.
   * @param {object} [options] - Run options.
   * @returns {Promise<object>} Run result.
   */
  async run(options = {}) {
    const inputKeys = options.inputKeys ? new Set(options.inputKeys) : null;

    if (inputKeys) {
      return this.runSelection({ ...options, inputKeys });
    }

    return this.runFull(options);
  }

  /**
   * Selection mode: walk the Activity List, match cards by Card Identity,
   * act on selected items, stop when all are final.
   * @param {object} [options] - Run options (must include inputKeys).
   * @returns {Promise<object>} Run result with counts.
   */
  async runSelection(options = {}) {
    const startTime = Date.now();
    const type = options.type || "comments";
    const timeoutMs = options.timeoutMs || 3600000;
    const maxEmptyScrolls = options.maxEmptyScrolls || 8;

    const inputKeys =
      options.inputKeys instanceof Set
        ? options.inputKeys
        : new Set(options.inputKeys || []);

    const prior = this.envelopeStore
      ? await this.envelopeStore.load(type)
      : null;

    const priorStatus = new Map();

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

    const remaining = new Set();

    for (const key of inputKeys) {
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

    const confirmed = await this.confirmAdapter.confirm(
      `Delete ${remaining.size} ${type} items? Type YES to proceed: `
    );

    if (!confirmed) {
      return { type, deleted: 0, durationMs: Date.now() - startTime, counts };
    }

    let emptySteps = 0;
    const maxEmptySteps = maxEmptyScrolls;

    while (remaining.size > 0) {
      if (timeoutMs > 0 && Date.now() - startTime > timeoutMs) break;

      const cardIds = await this.pageAdapter.collectCardIds();

      let actedThisStep = false;

      for (const cardId of cardIds) {
        if (!remaining.has(cardId)) continue;

        if (actedThisStep && remaining.size === 0) break;

        const result = await this.pageAdapter.oneCardAct(cardId);

        const status = outcomeToStatus({
          ok: result?.ok ?? false,
          error: result?.error,
        });

        remaining.delete(cardId);

        if (status === PURGE_STATUSES.DELETED) {
          deleted++;
          counts.deleted++;
        } else if (status === PURGE_STATUSES.NOT_FOUND) {
          counts.notFound++;
        } else {
          counts.failed++;
        }

        await this._persistStatus(cardId, status);
        actedThisStep = true;

        if (remaining.size === 0) break;
      }

      if (remaining.size === 0) break;

      if (!actedThisStep) {
        emptySteps++;

        if (emptySteps >= maxEmptySteps) {
          for (const cardId of remaining) {
            counts.notFound++;
            await this._persistStatus(cardId, PURGE_STATUSES.NOT_FOUND);
          }

          remaining.clear();
          break;
        }
      } else {
        emptySteps = 0;
      }

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

  /**
   * Full purge mode: walk the Activity List and act on every collected card.
   * @param {object} [options] - Run options.
   * @returns {Promise<object>} Run result with deleted count.
   */
  async runFull(options = {}) {
    const startTime = Date.now();
    const type = options.type || "comments";
    const timeoutMs = options.timeoutMs || 3600000;
    const batchSize = options.batchSize || 10;
    const maxEmptyScrolls = options.maxEmptyScrolls || 8;
    const batchMin = options.batchMin || 30000;
    const batchMax = options.batchMax || 60000;

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

        if (emptyScrolls >= maxEmptyScrolls) break;
        await this.pageAdapter.wait(1200);
        continue;
      }

      emptyScrolls = 0;

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

        const status = outcomeToStatus({
          ok: result?.ok ?? false,
          error: result?.error,
        });

        if (status === PURGE_STATUSES.DELETED) {
          deleted++;
          await this._persistStatus(cardId, PURGE_STATUSES.DELETED);
        } else {
          await this._persistStatus(cardId, status);
        }

        roundCount++;

        if (roundCount % batchSize === 0) {
          const pause =
            Math.floor(Math.random() * (batchMax - batchMin + 1)) + batchMin;

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

  /**
   * Persist a status for a card identity. Best-effort: warns on failure.
   * @param {string} cardId - Card identity.
   * @param {string} status - Purge status to persist.
   */
  async _persistStatus(cardId, status) {
    if (!this.envelopeStore) return;

    try {
      await this.envelopeStore.mark(cardId, status);
    } catch (err) {
      warn(`Could not persist status for ${cardId}: ${err.message}`);
    }
  }
}
