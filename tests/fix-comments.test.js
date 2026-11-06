// Unit tests for the comment-run fixer: merge three or more consecutive
// `//` comment lines into one block comment, leave shorter runs alone.
import assert from "node:assert";
import { mergeCommentRuns } from "../scripts/fix-comments.js";

// Three consecutive comment lines become a single block comment.
{
  const { lines, changed } = mergeCommentRuns([
    "const a = 1;",
    "// First rule of the house.",
    "// Second rule of the house.",
    "// Third rule of the house.",
    "const b = 2;",
  ]);
  assert.ok(changed, "a run of three lines is reported as changed");
  assert.equal(lines.length, 7, "three comment lines collapse into one block plus surrounding code");
  assert.equal(lines[0], "const a = 1;", "code before the run is preserved");
  assert.ok(lines[1].startsWith("/*"), "merged run starts with a block comment opener");
  assert.ok(lines[5].includes("*/"), "merged run ends with the block comment closer");
  assert.ok(lines[2].includes("First rule of the house."), "block body keeps the first line");
  assert.ok(lines[6], "code after the run is preserved");
}

// Two consecutive comment lines stay as `//` lines (within the limit).
{
  const { lines, changed } = mergeCommentRuns([
    "// First rule of the house.",
    "// Second rule of the house.",
    "const a = 1;",
  ]);
  assert.ok(!changed, "a run of two lines is left alone");
  assert.equal(lines.length, 3, "two comment lines plus code stay in place");
}

// A blank `//` separator line inside a longer run is preserved as an inner line.
{
  const { lines, changed } = mergeCommentRuns([
    "// Module header text.",
    "//",
    "// Body line one.",
    "const x = 1;",
  ]);
  assert.ok(changed, "a run of three with a blank separator is changed");
  assert.ok(lines[0].startsWith("/*"), "merged run starts with a block comment opener");
  assert.ok(lines.some((l) => l.trim() === "Module header text."), "block keeps module text");
}

console.log("PASS: fix comments (merge runs of three or more // lines into a block)");
