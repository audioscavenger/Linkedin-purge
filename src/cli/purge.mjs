// CLI purge command
import path from "node:path";
import fs from "node:fs";
import { log, warn } from "../logger.mjs";
import { PurgeRunner, PageAdapter, ConfirmAdapter } from "../purge.mjs";
import { EnvelopeStore } from "../envelope-store.mjs";
import { loadSelection } from "./selection.mjs";
import { activityTargets } from "../activity-targets.mjs";
import { resolveFlag, asInt, getFlag, resolveRunOptions } from "./config.mjs";
import { buildScanEnvelope } from "../scan-envelope.mjs";
import { openPage } from "../browser-opener.mjs";
import { generateSelectionPage } from "../selection-page.mjs";
import { ActivitySession } from "../activity-session.mjs";

export async function runPurge(args) {
  /*
  Loudly refuse the retired flag instead of silently ignoring it: statuses
  live in the scan envelope now (ticket 23). Nothing is purged, no browser
  is launched.
*/
  if (args.includes("--reset-checkpoint")) {
    console.error(
      "--reset-checkpoint was removed in 0.5.0: purge statuses now live in the scan envelope (data/scan-<type>.json). Pass nothing instead - the envelope is updated item by item as purge runs."
    );
    process.exit(1);
  }

  /*
  Loudly refuse the retired flag instead of silently ignoring it: purge is
  headless by default now, and --headed is the override. Nothing is
  purged, no browser is launched.
*/
  if (args.includes("--headless")) {
    console.error(
      "--headless was removed: scan and purge are headless by default. Use --headed to open a visible window instead."
    );
    process.exit(1);
  }

  const {
    profileDir,
    dataDir,
    typeArg,
    chromiumPath,
    headless,
    cdpEndpoint,
    timing,
  } = resolveRunOptions(args);

  const limitArg = asInt(resolveFlag(args, "limit", "behavior.limit", 0), 0);

  /*
  Optional: restrict deletion to a selection from --input. This is the
  v0.5.0 review-first flow: scan writes data/selection-<type>.html from the
  scan envelope, the person ticks the items worth deleting, Export writes
  data/selection-<type>.json with status: todo, and purge --input acts
  on that file. Selected items outside the selection are never touched.
*/
  const inputFile = getFlag(args, "input", null);

  /* Load the selection before the browser launches, so an unusable file fails
  without a visit. Statuses already final (deleted) or no-op are skipped;
  anything todo/failed/not-found is actionable, and a selection with
  zero actionable items exits without prompting. */
  let selection = null;

  if (inputFile) {
    if (path.extname(inputFile).toLowerCase() === ".html") {
      console.error(
        `Error: --input expects a JSON scan envelope file (e.g. data/selection-likes.json or data/scan-likes.json), not an HTML file (${inputFile}).`
      );
      process.exit(1);
    }

    selection = loadSelection(inputFile);
    log(
      `Selection: ${selection.total} items in ${inputFile} (${selection.actionable} actionable).`
    );

    if (selection.actionable === 0) {
      log("Nothing actionable in the selection; exiting without prompting.");

      return;
    }
  }

  // Timing options, all overridable via CLI.
  const actionMin = asInt(
    resolveFlag(args, "action-min", "timing.actionMin", 2000),
    2000
  );

  const actionMax = asInt(
    resolveFlag(args, "action-max", "timing.actionMax", 5000),
    5000
  );

  const batchMin = asInt(
    resolveFlag(args, "batch-min", "timing.batchMin", 30000),
    30000
  );

  const batchMax = asInt(
    resolveFlag(args, "batch-max", "timing.batchMax", 60000),
    60000
  );

  /*
  One Purge Run per concrete type, each on the Activity List tab where its
  page detector matches. Resolved before the browser launches, so an unknown
  type fails without a visit. A selection file carries its own type.
*/
  const targetType = selection && selection.type ? selection.type : typeArg;
  const targets = activityTargets(targetType);

  /*
    One Activity Session for the invocation: it owns the launch (or --cdp
    attach), the injected helpers, the login guards, the base URL and the tab
    navigation. This command owns the purge runs and the selection page.
  */
  const session = await ActivitySession.open({
    profileDir,
    headless,
    chromiumPath,
    cdp: cdpEndpoint,
  });

  try {
    // Load input keys if --input was specified
    const inputKeys = selection ? selection.identities : null;

    // Everything a run needs except its type, which is per target.
    const runOptions = {
      timeoutMs: asInt(timing.timeout, 3600000),
      batchSize: asInt(timing.batchSize, 10),
      maxRetries: asInt(timing.maxRetries, 4),
      maxEmptyScrolls: asInt(timing.maxEmptyScrolls, 8),
      backoffBase: asInt(timing.backoffBase, 10000),
      actionMin,
      actionMax,
      batchMin,
      batchMax,
      limit: limitArg,
      inputKeys,
      selectionStatusMap:
        selection && selection.statusMap ? selection.statusMap : null,
    };

    const results = [];

    for (const target of targets) {
      log(`=== Purging ${target.type} ===`);
      const page = await session.openTarget(target);

      /*
  The adapters are per type: neither flow wires checkpoint or report
  anymore (both retired in tickets 23/24). A selection run persists
  statuses straight into the selection envelope through the store; a
  full purge run wires the envelopeStore to persist statuses.
*/
      const envelopeStore = inputFile
        ? new EnvelopeStore({ file: path.resolve(inputFile) })
        : new EnvelopeStore({
            file: path.resolve(dataDir, `scan-${target.type}.json`),
          });

      const runner = new PurgeRunner({
        pageAdapter: new PageAdapter(page),
        confirmAdapter: new ConfirmAdapter(),
        envelopeStore,
      });

      // The runner asks its own confirmation prompt once per type.
      results.push(await runner.run({ type: target.type, ...runOptions }));

      // Regenerate selection page / JSON only when not running with a custom input file
      if (!inputFile) {
        try {
          const envelopeFile = path.resolve(
            dataDir,
            `scan-${target.type}.json`
          );

          let envelope = null;

          try {
            envelope = JSON.parse(fs.readFileSync(envelopeFile, "utf8"));
          } catch (readErr) {
            warn(
              `Could not read updated envelope from ${envelopeFile}: ${readErr.message}`
            );
          }

          if (!envelope) {
            envelope = buildScanEnvelope({
              type: target.type,
              items: [],
              steps: 1,
              complete: true,
            });
          }

          const selectionHtml = generateSelectionPage(envelope);

          const selectionPagePath = path.join(
            dataDir,
            `selection-${target.type}.html`
          );

          fs.writeFileSync(selectionPagePath, selectionHtml);
          log(
            `Selection page written to: ${path.relative(process.cwd(), selectionPagePath)}`
          );
          await openPage(selectionPagePath);
        } catch (err) {
          warn(`Failed to generate selection page: ${err.message}`);
        }
      }
    }

    reportSummary(results);
    log("Done.");
  } finally {
    await session.close();
  }
}

// Closing summary across every Purge Run of this invocation: one line per type
// with its own report path, plus a total when more than one type ran.
function reportSummary(results) {
  for (const result of results) {
    if (result.deleted > 0) {
      log(`${result.type}: ${result.deleted} items deleted`);
    } else if (result.deleted === 0) {
      log(`${result.type}: purge cancelled or nothing to delete.`);
    }

    if (result.counts) {
      // Selection runs: per-status tally appended regardless of deletions.
      const c = result.counts;
      log(
        `${result.type}: ${c.deleted} deleted, ${c.failed} failed, ${c.notFound} not-found, ${c.noOp} no-op`
      );
    }
  }

  if (results.length > 1) {
    const deleted = results.reduce((sum, result) => sum + result.deleted, 0);
    log(`Total: ${deleted} items deleted across ${results.length} types.`);
  }
}

// Helper for flags that don't have a config.json source of truth (--type).
