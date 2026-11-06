// Unit tests for the comment-run check: three or more consecutive `//` comment
// lines are a violation of the AGENTS.md house rule; two are allowed.
import assert from "node:assert";
import { findCommentRuns } from "../scripts/check-comments.js";

// A run of three consecutive comment lines is flagged.
{
  const runs = findCommentRuns([
    "const a = 1;",
    "// First rule of the house.",
    "// Second rule of the house.",
    "// Third rule of the house.",
    "const b = 2;",
  ]);
  assert.equal(runs.length, 1, "a run of three lines is reported");
  assert.equal(runs[0].length, 3, "the reported run holds the comment lines");
}

// A run of two consecutive comment lines is within the limit.
{
  const runs = findCommentRuns([
    "// First rule of the house.",
    "// Second rule of the house.",
    "const a = 1;",
  ]);
  assert.equal(runs.length, 0, "a run of two lines is allowed");
}

console.log("PASS: check comments (fail on runs of three or more // lines)");
