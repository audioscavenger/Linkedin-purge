// CLI scan command
import fs from "node:fs";
import path from "node:path";
import { log, warn } from "../logger.mjs";
import {
  resolveFlag,
  asBool,
  loadConfig,
  resolveRunOptions,
} from "./config.mjs";
import { ActivityLoader, createActivityPage } from "../activity-loader.mjs";
import { buildScanEnvelope } from "../scan-envelope.mjs";
import { buildScanSummary } from "../scan-summary.mjs";
import { activityTargets } from "../activity-targets.mjs";
import { openPage } from "../browser-opener.mjs";
import { generateSelectionPage } from "../selection-page.mjs";
import { ActivitySession } from "../activity-session.mjs";

export async function runScan(args) {
  /*
  Loudly refuse the retired flag instead of silently ignoring it: scan is
  headless by default now, and --headed is the override. Nothing is
  scanned, no browser is launched.
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

  const deep = asBool(resolveFlag(args, "deep", "behavior.deepScan", false));
  /* Links are on by default: behavior.links in config (default true). Capturing
  a link opens each card's menu, so it costs about one second per item.
  No CLI flag - the option was removed; config is the only knob. */
  const links = asBool(loadConfig().behavior.links, true);

  // One scan per concrete type, resolved before the browser launches so an
  // unknown type fails without a visit.
  const targets = activityTargets(typeArg);

  /*
    One Activity Session for the invocation: it owns the launch (or --cdp
    attach), the injected helpers, the login guards, the base URL and the tab
    navigation. This command owns the walk, the envelope and the selection page.
  */
  const session = await ActivitySession.open({
    profileDir,
    headless,
    chromiumPath,
    cdp: cdpEndpoint,
  });

  try {
    for (const target of targets) {
      const t = target.type;
      log(`=== Scanning ${t}${deep ? " (deep)" : ""} ===`);
      const page = await session.openTarget(target);

      const loader = new ActivityLoader({
        page: createActivityPage(page, { links }),
        timing,
        onStep: (event) => log(stepLine(t, event)),
      });

      // Deep walks the Activity List; plain scan reads the first render only.
      const startedAt = Date.now();

      const result = deep
        ? await loader.collectAll()
        : await loader.readFirstRender();

      const elapsedMs = Date.now() - startedAt;

      const out = path.join(dataDir, `scan-${t}.json`);
      fs.mkdirSync(dataDir, { recursive: true });

      const envelope = buildScanEnvelope({
        type: t,
        items: result.items,
        steps: result.steps,
        complete: result.complete,
      });

      fs.writeFileSync(out, JSON.stringify(envelope, null, 2));

      if (!result.complete) {
        warn(
          `${t}: the walk hit the timeout after ${result.steps} steps; ` +
            `the file holds the ${result.items.length} items collected so far and is marked complete: false.`
        );
      }

      // Generate the selection page from the same envelope.
      const selectionHtml = generateSelectionPage(envelope);
      const selectionPagePath = path.join(dataDir, `selection-${t}.html`);
      fs.writeFileSync(selectionPagePath, selectionHtml);
      log(`Selection page written to: ${selectionPagePath}`);

      // The summary prints the page's relative path.
      log(
        buildScanSummary({
          type: t,
          result,
          links,
          elapsedMs,
          pagePath: path.relative(process.cwd(), selectionPagePath),
        })
      );

      /*
  Open the page in the OS default browser; best effort only.
  Pass the plain path: the platform openers (open / xdg-open / start) take
  a file path, not a URL, and path.resolve mangles a file:// URL on Windows.
*/
      await openPage(selectionPagePath);
    }
  } finally {
    await session.close();
  }
}

// One progress line per load step: step number, running item count, delta and
// the wait the step cost, plus the scroll target when there was one.
function stepLine(type, event) {
  const target = event.target;

  const where =
    target && (target.id || target.tag)
      ? ` target=${target.tag || "?"}${target.id ? "#" + target.id : ""}`
      : "";

  return `${type} step ${event.step}: ${event.total} items (+${event.added}), waited ${event.waitedMs}ms${where}`;
}

export * from "../scan-summary.mjs";
