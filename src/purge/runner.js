// Core PurgeRunner logic

import fs from "node:fs";

export class PurgeRunner {
  constructor({
    pageAdapter,
    checkpointAdapter,
    reporterAdapter,
    confirmAdapter,
  }) {
    this.pageAdapter = pageAdapter;
    this.checkpointAdapter = checkpointAdapter;
    this.reporterAdapter = reporterAdapter;
    this.confirmAdapter = confirmAdapter;
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

    // Load existing checkpoint
    const cpResult = await this.checkpointAdapter.load();
    const processedSet = cpResult.processed;

    // The eligibility rule lives only here (single-sited): a key is eligible
    // if it's not already processed (checkpoint) AND (if inputKeys is set) it's
    // in inputKeys. The runner computes the eligible list and hands it to the
    // page adapter, which does a plain membership test over the passed list.
    const eligible = (k) => !processedSet.has(k) && (!inputKeys || inputKeys.has(k));

    // Collect keys and filter by checkpoint + input
    const keys = await this.pageAdapter.collectKeys();
    const pendingCount = keys.filter(eligible).length;

    if (pendingCount === 0) {
      // Nothing to do
      await this.reporterAdapter.open(type);
      const reportPath = await this.reporterAdapter.close();
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
      await this.reporterAdapter.open(type);
      const reportPath = await this.reporterAdapter.close();
      return { type, deleted: 0, processed: processedSet.size, durationMs: Date.now() - startTime, reportPath };
    }

    // Initialize report
    await this.reporterAdapter.open(type);

    let deleted = 0;
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
        await this.reporterAdapter.write({
          key: result.key,
          ts: new Date().toISOString(),
          state: result.state || null,
          author: result.author || null,
          postHref: result.postHref || null,
          dateTime: result.dateTime || null,
        });

        if (deleted % batchSize === 0) {
          await this.checkpointAdapter.save();
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

    // Final save and close
    await this.checkpointAdapter.save();
    const reportPath = await this.reporterAdapter.close();

    return {
      type,
      deleted,
      processed: processedSet.size,
      durationMs: Date.now() - startTime,
      reportPath,
    };
  }
}