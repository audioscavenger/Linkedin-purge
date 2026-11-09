// Unit tests for the comment-run fixer: merge three or more consecutive
// `//` comment lines into one block comment, leave shorter runs alone.
import assert from "node:assert";
import {
  fixText,
  mergeCommentRuns,
  parseComments,
} from "../scripts/fix-comments.mjs";

// Helper: the input must come back untouched and not be reported as changed.
function assertUnchanged(label, input) {
  const { lines, changed } = mergeCommentRuns(input);
  assert.ok(!changed, `${label}: not reported as changed`);
  assert.deepStrictEqual(lines, input, `${label}: lines are identical`);
}

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
  assert.equal(
    lines.length,
    7,
    "three comment lines collapse into one block plus surrounding code"
  );
  assert.equal(lines[0], "const a = 1;", "code before the run is preserved");
  assert.ok(
    lines[1].startsWith("/*"),
    "merged run starts with a block comment opener"
  );
  assert.ok(
    lines[5].includes("*/"),
    "merged run ends with the block comment closer"
  );
  assert.ok(
    lines[2].includes("First rule of the house."),
    "block body keeps the first line"
  );
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
  assert.ok(
    lines[0].startsWith("/*"),
    "merged run starts with a block comment opener"
  );
  assert.ok(
    lines.some((l) => l.trim() === "Module header text."),
    "block keeps module text"
  );
}

// Indentation of the run is kept on the opener, body and closer.
{
  const { lines } = mergeCommentRuns([
    "function f() {",
    "  // one",
    "  //   indented",
    "  // two",
    "  return 1;",
    "}",
  ]);
  assert.deepStrictEqual(
    lines,
    [
      "function f() {",
      "  /*",
      "    one",
      "      indented",
      "    two",
      "  */",
      "  return 1;",
      "}",
    ],
    "block is indented like the run and inner indentation survives"
  );
}

// `//` lines inside a block comment are never touched.
assertUnchanged("block comment with // lines", [
  "/*",
  "  // a",
  "  // b",
  "  // c",
  "*/",
  "x();",
]);
assertUnchanged("JSDoc with // lines", [
  "function f() {",
  "  /**",
  "   * // a",
  "   * // b",
  "   * // c",
  "   */",
  "}",
]);

// `//` lines inside strings and template literals are never touched.
assertUnchanged("template literal", [
  "const s = `",
  "// a",
  "// b",
  "// c",
  "`;",
]);
assertUnchanged("string continuation", [
  "const s = 'x\\",
  "// a\\",
  "// b\\",
  "// c';",
]);

// A run whose text contains a block terminator is skipped and counted.
{
  const input = ["// glob: src/**/*.js", "// b", "// c", "x();"];
  const { lines, changed, skipped } = mergeCommentRuns(input);
  assert.ok(!changed, "a run containing a block terminator is not changed");
  assert.deepStrictEqual(lines, input, "the run is left as it was");
  assert.equal(skipped, 1, "the skipped run is counted");
}

// Tool comments are never merged and they split a run.
assertUnchanged("triple-slash references", [
  '/// <reference types="a" />',
  '/// <reference types="b" />',
  '/// <reference types="c" />',
  "x();",
]);
assertUnchanged("directive inside a run", [
  "// a",
  "// eslint-disable-next-line no-console",
  "// b",
  "// c",
  "x();",
]);

// Plain lines before a directive merge, and the directive stays next to its code.
{
  const { lines, changed } = mergeCommentRuns([
    "// a",
    "// b",
    "// c",
    "// eslint-disable-next-line no-console",
    "console.log(1);",
  ]);
  assert.ok(changed, "the plain lines are merged");
  assert.deepStrictEqual(
    lines,
    [
      "/*",
      "  a",
      "  b",
      "  c",
      "*/",
      "// eslint-disable-next-line no-console",
      "console.log(1);",
    ],
    "the directive line is still directly above the code"
  );
}

// Blank lines, trailing comments and indentation changes all end a run.
assertUnchanged("blank line between runs", [
  "// a",
  "// b",
  "",
  "// c",
  "// d",
  "x();",
]);
assertUnchanged("trailing comments", ["a(); // 1", "b(); // 2", "c(); // 3"]);
assertUnchanged("indentation change", ["// a", "  // b", "// c", "x();"]);

// A block comment ends a run on either side and is never merged into.
assertUnchanged("two lines on each side of a block", [
  "// a",
  "// b",
  "/* blk */",
  "// c",
  "// d",
  "x();",
]);
{
  const { lines } = mergeCommentRuns([
    "/* keep",
    "   exactly */",
    "// a",
    "// b",
    "// c",
    "x();",
  ]);
  assert.deepStrictEqual(
    lines,
    ["/* keep", "   exactly */", "/*", "  a", "  b", "  c", "*/", "x();"],
    "a run after a block becomes its own block"
  );
}
{
  const { lines } = mergeCommentRuns([
    "// a",
    "// b",
    "// c",
    "/* keep */",
    "x();",
  ]);
  assert.deepStrictEqual(
    lines,
    ["/*", "  a", "  b", "  c", "*/", "/* keep */", "x();"],
    "a run before a block becomes its own block"
  );
}

// CRLF files get CRLF line endings only.
{
  const input = ["// a", "// b", "// c", "x();"].join("\r\n");
  const { text } = fixText("sample.js", input);
  assert.equal(
    text,
    ["/*", "  a", "  b", "  c", "*/", "x();"].join("\r\n"),
    "CRLF is kept"
  );
  assert.ok(!/(?<!\r)\n/.test(text), "no bare LF is introduced");
}

// A second pass changes nothing.
{
  const input = [
    "// a",
    "// b",
    "// c",
    "x();",
    "/* blk",
    "// z",
    "// y",
    "// w",
    "*/",
    "// d",
    "// e",
    "// f",
  ];
  const once = mergeCommentRuns(input);
  const twice = mergeCommentRuns(once.lines);
  assert.ok(!twice.changed, "second run reports no change");
  assert.deepStrictEqual(
    twice.lines,
    once.lines,
    "second run leaves the lines alone"
  );
}

// Every block comment that existed before is still there, byte for byte.
{
  const input = [
    "/* one",
    "// a",
    "// b",
    "// c",
    "*/",
    "// x",
    "// y",
    "// z",
    "/** two */",
    "// p",
    "// q",
    "// r",
  ].join("\n");
  const blocks = (text) =>
    parseComments("sample.js", text)
      .filter((c) => c.type === "Block")
      .map((c) => text.slice(c.range[0], c.range[1]));
  const after = blocks(fixText("sample.js", input).text);
  for (const b of blocks(input))
    assert.ok(after.includes(b), "original block comment survives");
}

// TypeScript works when the optional parser is installed.
let tsAvailable = true;
try {
  await import("@typescript-eslint/parser");
} catch {
  tsAvailable = false;
}
if (tsAvailable) {
  const { lines } = mergeCommentRuns(
    [
      "type A = { x: number };",
      "/*",
      "// a",
      "// b",
      "// c",
      "*/",
      "// d",
      "// e",
      "// f",
      "const v: A = { x: 1 };",
    ],
    "sample.ts"
  );
  assert.deepStrictEqual(
    lines,
    [
      "type A = { x: number };",
      "/*",
      "// a",
      "// b",
      "// c",
      "*/",
      "/*",
      "  d",
      "  e",
      "  f",
      "*/",
      "const v: A = { x: 1 };",
    ],
    "TS: merges outside blocks, ignores inside"
  );
}

console.log(
  "PASS: fix comments (merge runs of three or more // lines into a block)"
);