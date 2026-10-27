// Unit tests for the Purge Run targets: which Activity List tab each type is
// purged on. No browser: the mapping is a pure decision, so it is pinned here
// instead of by opening LinkedIn.
import { purgeTargets } from "../src/purge/targets.js";

// The tab names come from the in-page page detectors, which match
// /recent-activity/comments and /recent-activity/reactions. Purging the
// activity "all" tab matches neither, which is the bug this pins.
async function testLikesTargetsReactionsTab() {
  const targets = purgeTargets("likes");
  if (targets.length !== 1) throw new Error(`Expected 1 target for likes, got ${targets.length}`);
  if (targets[0].type !== "likes" || targets[0].tab !== "reactions/") {
    throw new Error(`Expected likes on reactions/, got ${JSON.stringify(targets[0])}`);
  }
  console.log("PASS: likes purges on the reactions tab");
}

async function testCommentsTargetsCommentsTab() {
  const targets = purgeTargets("comments");
  if (targets.length !== 1) throw new Error(`Expected 1 target for comments, got ${targets.length}`);
  if (targets[0].type !== "comments" || targets[0].tab !== "comments/") {
    throw new Error(`Expected comments on comments/, got ${JSON.stringify(targets[0])}`);
  }
  console.log("PASS: comments purges on the comments tab");
}

// "all" is one Purge Run per concrete type, each with its own tab and its own
// checkpoint and report. The aggregate type must never reach the adapters:
// checkpoint-all.json would be a checkpoint nothing ever resumes.
async function testAllExpandsToConcreteTypes() {
  const targets = purgeTargets("all");
  const summary = targets.map((t) => `${t.type}@${t.tab}`).join(",");
  if (summary !== "comments@comments/,likes@reactions/") {
    throw new Error(`Expected comments@comments/,likes@reactions/, got ${summary}`);
  }
  if (targets.some((t) => t.type === "all")) {
    throw new Error("The aggregate type leaked into a target; per-type adapters need a concrete type");
  }
  console.log("PASS: all expands to one concrete target per type, in run order");
}

// An unknown type must fail before the browser launches, not after a visit to
// a tab that does not exist.
async function testUnknownTypeRejected() {
  let message = null;
  try {
    purgeTargets("videos");
  } catch (e) {
    message = e.message;
  }
  if (message !== "Unknown type: videos") {
    throw new Error(`Expected "Unknown type: videos", got ${JSON.stringify(message)}`);
  }

  console.log("PASS: unknown type rejected");
}

const tests = {
  testLikesTargetsReactionsTab,
  testCommentsTargetsCommentsTab,
  testAllExpandsToConcreteTypes,
  testUnknownTypeRejected,
};

async function main() {
  let passed = 0;
  let failed = 0;

  for (const [name, fn] of Object.entries(tests)) {
    try {
      await fn();
      passed++;
    } catch (e) {
      console.error(`FAIL: ${name} - ${e.message}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
