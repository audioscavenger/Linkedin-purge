/*
  Fix comment runs: merge three or more consecutive standalone `//` comment
  lines into one block comment (house rule in AGENTS.md).

  Comments are located with a real parser (espree for JS, typescript-eslint
  for TS), never with regexes over raw lines. Text inside block comments,
  strings, template literals and regex literals is therefore never a
  candidate. As a final guard, every block comment present before a rewrite
  must still be present, byte for byte, after it, or the file is not written.

  Usage: node scripts/fix-comments.js [--check] [file-or-dir ...]
    (no paths)  scan src, tests and scripts
    --check     report only; exit 1 if any file would change
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as espree from "espree";

let tsParser = null;
try {
  const mod = await import("@typescript-eslint/parser");
  tsParser = mod.parse ? mod : mod.default;
} catch {
  // TS files will be reported as errors if the parser is missing.
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["src", "tests", "scripts"];
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".agents",
]);
const FILE_RE = /\.[cm]?[jt]sx?$/;
const MIN_RUN = 3;

/*
  Comments that tools read: directives, triple-slash references, region
  markers. They are never merged and they break a run.
*/
const KEEP =
  /^\s*(?:\/|eslint|@ts-|prettier-ignore|istanbul|c8\b|v8 ignore|globals?\b|jshint|@flow|@jsx|@vitest-environment|@jest-environment|biome-ignore|#(?:end)?region)/;

export function parseComments(file, text) {
  const opts = { comment: true, range: true, loc: true };
  if (/\.[cm]?tsx?$/.test(file)) {
    if (!tsParser)
      throw new Error("@typescript-eslint/parser is not installed");
    return tsParser.parse(text, { ...opts, jsx: file.endsWith("x") }).comments;
  }
  const base = { ...opts, ecmaVersion: "latest", ecmaFeatures: { jsx: true } };
  const sourceType = file.endsWith(".cjs") ? "commonjs" : "module";
  try {
    return espree.parse(text, { ...base, sourceType }).comments;
  } catch (err) {
    if (sourceType === "commonjs") throw err;
    return espree.parse(text, { ...base, sourceType: "script" }).comments;
  }
}

function describe(text, c) {
  const ls = text.lastIndexOf("\n", c.range[0] - 1) + 1;
  const indent = text.slice(ls, c.range[0]);
  return { c, ls, indent, standalone: /^[ \t]*$/.test(indent) };
}

/*
  Runs of MIN_RUN+ consecutive standalone `//` comments on adjacent lines
  with identical indentation. Block comments, trailing comments, tool
  directives, blank lines and code all end a run.
*/
export function findRuns(text, comments) {
  const runs = [];
  let cur = [];
  const flush = () => {
    if (cur.length >= MIN_RUN) runs.push(cur);
    cur = [];
  };
  for (const c of comments) {
    const info =
      c.type === "Line" && !KEEP.test(c.value) ? describe(text, c) : null;
    if (!info || !info.standalone) {
      flush();
      continue;
    }
    const prev = cur.at(-1);
    if (
      prev &&
      (c.loc.start.line !== prev.c.loc.start.line + 1 ||
        info.indent !== prev.indent)
    ) {
      flush();
    }
    cur.push(info);
  }
  flush();
  return runs;
}

export function mergeCommentRunsInText(text, comments) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const edits = [];
  let skipped = 0;
  for (const run of findRuns(text, comments)) {
    const bodies = run.map(({ c }) => c.value.replace(/^ /, "").trimEnd());
    if (bodies.some((b) => b.includes("*/"))) {
      skipped += 1; // would terminate the new block early
      continue;
    }
    const ind = run[0].indent;
    const block = [
      `${ind}/*`,
      ...bodies.map((b) => (b ? `${ind}  ${b}` : "")),
      `${ind}*/`,
    ];
    edits.push({
      start: run[0].ls,
      end: run.at(-1).c.range[1],
      text: block.join(eol),
    });
  }
  let out = text;
  for (const e of edits.reverse())
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return { text: out, changed: edits.length > 0, skipped };
}

function blockTexts(text, comments) {
  return comments
    .filter((c) => c.type === "Block")
    .map((c) => text.slice(c.range[0], c.range[1]));
}

function assertBlocksPreserved(before, after) {
  const counts = new Map();
  for (const b of after) counts.set(b, (counts.get(b) ?? 0) + 1);
  for (const b of before) {
    const n = counts.get(b) ?? 0;
    if (n === 0)
      throw new Error("safety check failed: a block comment would be altered");
    counts.set(b, n - 1);
  }
}

export function fixText(file, text) {
  const comments = parseComments(file, text);
  const result = mergeCommentRunsInText(text, comments);
  if (result.changed) {
    const after = parseComments(file, result.text); // must still parse
    assertBlocksPreserved(
      blockTexts(text, comments),
      blockTexts(result.text, after)
    );
  }
  return result;
}

/*
  Original lines-in, lines-out API, kept so existing callers and tests work.
  The lines must form parseable source; otherwise this throws.
*/
export function mergeCommentRuns(lines, file = "snippet.js") {
  const result = fixText(file, lines.join("\n"));
  return {
    lines: result.text.split("\n"),
    changed: result.changed,
    skipped: result.skipped,
  };
}

export function findJsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...findJsFiles(full));
    } else if (entry.isFile() && FILE_RE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

export function fixFiles(files, { write = true } = {}) {
  const changedFiles = [];
  const skipped = [];
  const errors = [];
  for (const file of files) {
    const rel = path.relative(root, file);
    const raw = fs.readFileSync(file, "utf8");
    const bom = raw.charCodeAt(0) === 0xfeff ? "\uFEFF" : "";
    const text = bom ? raw.slice(1) : raw;
    let result;
    try {
      result = fixText(file, text);
    } catch (err) {
      errors.push({ file: rel, message: err.message });
      continue;
    }
    if (result.changed) {
      changedFiles.push(rel);
      if (write) fs.writeFileSync(file, bom + result.text);
    }
    if (result.skipped) skipped.push({ file: rel, count: result.skipped });
  }
  return { changedFiles, skipped, errors };
}

export function fixCommentsIn(dir, opts) {
  return fixFiles(findJsFiles(dir), opts);
}

function inScope(file) {
  const top = path.relative(root, file).split(path.sep)[0];
  return SCAN_DIRS.includes(top);
}

/*
  No arguments: every file under SCAN_DIRS. Directory arguments are scanned
  as given. File arguments (what lint-staged passes) are only taken when they
  live under SCAN_DIRS, so staging a root file never widens the fixer's scope.
*/
function collectTargets(args) {
  if (args.length === 0) {
    return SCAN_DIRS.flatMap((d) => findJsFiles(path.resolve(root, d)));
  }
  const files = [];
  for (const arg of args) {
    const full = path.resolve(process.cwd(), arg);
    if (!fs.existsSync(full)) continue;
    if (fs.statSync(full).isDirectory()) files.push(...findJsFiles(full));
    else if (FILE_RE.test(full) && inScope(full)) files.push(full);
  }
  return files;
}

function main(argv) {
  const check = argv.includes("--check");
  const args = argv.filter((a) => !a.startsWith("--"));
  const {
    changedFiles: changed,
    skipped,
    errors,
  } = fixFiles(collectTargets(args), { write: !check });
  if (changed.length > 0) {
    console.log(
      `${check ? "Would merge" : "Merged"} comment runs in ${changed.length} file(s):`
    );
    for (const f of changed) console.log(`  - ${f}`);
  }
  const remaining = skipped.reduce((n, s) => n + s.count, 0);
  console.log(
    `Comment runs of ${MIN_RUN}+ lines left alone (contain a block terminator): ${remaining}`
  );
  for (const s of skipped) console.log(`  - ${s.file} (${s.count})`);
  for (const e of errors) console.error(`ERROR ${e.file}: ${e.message}`);
  if (errors.length > 0) return 1;
  if (check && changed.length > 0) return 1;
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  process.exitCode = main(process.argv.slice(2));
}
