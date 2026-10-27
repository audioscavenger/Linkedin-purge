// Unit tests for the Activity targets: one concrete type per run, on the
// Activity List tab where that type's page detector matches. Scan and purge
// both resolve their type through this one mapping. No browser: the mapping is
// a pure decision, so it is pinned here instead of by opening LinkedIn.
import { activityTargets } from "../src/activity-targets.js";

// The tab names come from the in-page page detectors, which match
// /recent-activity/comments and /recent-activity/reactions. The activity "all"
// tab matches neither, which is the bug purge hit before this mapping.
async function testLikesResolvesToReactionsTab() {
  const targets = activityTargets("likes");
  if (targets.length !== 1) throw new Error(`Expected 1 target for likes, got ${targets.length}`);
  if (targets[0].type !== "likes" || targets[0].tab !== "reactions/") {
    throw new Error(`Expected likes on reactions/, got ${JSON.stringify(targets[0])}`);
  }
  console.log("PASS: likes resolves to the reactions tab");
}

async function testCommentsResolvesToCommentsTab() {
  const targets = activityTargets("comments");
  if (targets.length !== 1) throw new Error(`Expected 1 target for comments, got ${targets.length}`);
  if (targets[0].type !== "comments" || targets[0].tab !== "comments/") {
    throw new Error(`Expected comments on comments/, got ${JSON.stringify(targets[0])}`);
  }
  console.log("PASS: comments resolves to the comments tab");
}

// "all" is one run per concrete type, each with its own tab and therefore its
// own checkpoint and report file. The aggregate type must never reach a run:
// checkpoint-all.json would be a checkpoint nothing ever resumes, and
// scan-all.json would overwrite the per-type envelopes.
async function testAllExpandsToConcreteTypes() {
  const targets = activityTargets("all");
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
  for (const type of ["videos", "reactions", "likes,comments"]) {
    let message = null;
    try {
      activityTargets(type);
    } catch (e) {
      message = e.message;
    }
    if (message !== `Unknown type: ${type}`) {
      throw new Error(`Expected "Unknown type: ${type}", got ${JSON.stringify(message)}`);
    }
  }
  console.log("PASS: unknown type rejected with the same named error");
}

const tests = [
  testLikesResolvesToReactionsTab,
  testCommentsResolvesToCommentsTab,
  testAllExpandsToConcreteTypes,
  testUnknownTypeRejected,
];

async function main() {
  let failed = 0;
  for (const fn of tests) {
    try {
      await fn();
    } catch (e) {
      console.error(`FAIL: ${fn.name} - ${e.message}`);
      failed++;
    }
  }
  const passed = tests.length - failed;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
