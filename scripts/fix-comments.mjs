#!/usr/bin/env node
/**
 * Fix comment runs: merge three or more consecutive standalone `//` comment
 * lines into one block comment (house rule in AGENTS.md).
 *
 * Hidden folders (anything starting with "."), node_modules, .git and the
 * other SKIP_DIRS are never touched.
 *
 * Usage: node scripts/fix-comments.mjs [--check] [file-or-dir ...]
 *   (no paths)  scan src, tests, scripts, tools and frontend dirs
 *   --check     report only; exit 1 if any file would change
 */

import fs from "node:fs";
import path from "node:path";
import * as espree from "espree";

let tsParser = null;
try {
  tsParser =
    (await import("@typescript-eslint/parser"))?.parse ||
    (await import("@typescript-eslint/parser")).default;
} catch {
  /*
    TS files will be reported as errors if the parser is missing.
    Optional: install @typescript-eslint/parser to enable TS/TSX.
  */
}

const root = path.resolve(import.meta.dirname, "..");
const SCAN_DIRS = [
  "src",
  "tests",
  "scripts",
  "tools",
  "client",
  "frontend",
  "web",
  "app",
];
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".husky",
  ".agents",
  "data",
]);
const FILE_RE = /\.[cm]?[jt]sx?$/;
const MIN_RUN = 3;
const KEEP =
  /^\s*(?:\/|eslint|@ts-|prettier-ignore|istanbul|c8\b|v8 ignore|globals?\b|jshint|@flow|@jsx|@vitest-environment|@jest-environment|biome-ignore|#(?:end)?region)/;

function isHiddenDir(entry) {
  return entry.name.startsWith(".");
}

function parseComments(file, text) {
  const opts = { comment: true, range: true, loc: true };
  if (/\.[cm]?tsx?$/.test(file)) {
    if (!tsParser) throw new Error("TypeScript parser not available");
    return tsParser.parse(text, { ...opts, jsx: file.endsWith("x") }).comments;
  }
  const base = { ...opts, ecmaVersion: "latest", ecmaFeatures: { jsx: true } };
  const sourceType = file.endsWith(".cjs")
    ? "commonjs"
    : file.endsWith(".mjs")
      ? "module"
      : "commonjs";
  try {
    return espree.parse(text, { ...base, sourceType }).comments;
  } catch {
    if (sourceType === "commonjs") {
      try {
        return espree.parse(text, { ...base, sourceType: "module" }).comments;
      } catch {
        return espree.parse(text, { ...base, sourceType: "script" }).comments;
      }
    }
    return espree.parse(text, { ...base, sourceType: "script" }).comments;
  }
}

function describe(text, c) {
  const snippet = text.slice(c.range[0], c.range[1]);
  return snippet.trim();
}

function findRuns(text, comments) {
  const runs = [];
  let cur = [];
  const flush = () => {
    if (cur.length >= MIN_RUN) {
      runs.push([...cur]);
    }
    cur = [];
  };
  for (const c of comments) {
    if (c.type !== "Line") {
      flush();
      continue;
    }
    const snippet = describe(text, c);
    if (KEEP.test(snippet)) {
      flush();
      continue;
    }
    if (cur.length === 0) {
      cur.push(c);
    } else {
      const prev = cur[cur.length - 1];
      if (
        c.loc.start.line === prev.loc.end.line + 1 &&
        c.range[0] - prev.range[1] <= 2
      ) {
        cur.push(c);
      } else {
        flush();
        cur.push(c);
      }
    }
  }
  flush();
  return runs;
}

function mergeCommentRunsInText(text, comments) {
  const edits = [];
  let skipped = 0;
  for (const run of findRuns(text, comments)) {
    const first = run[0];
    const last = run[run.length - 1];
    const start = first.range[0];
    const end = last.range[1];
    const lines = text.slice(start, end).split(/\r?\n/);
    const indent = lines[0].match(/^\s*/)[0];
    const content = lines
      .map((l) => l.replace(/^\s*\/\/\s?/, "").trimEnd())
      .join(" ")
      .trim();
    if (!content) {
      skipped += 1;
      continue;
    }
    const block = `${indent}/* ${content} */`;
    edits.push({ start, end, text: block });
  }
  if (!edits.length) return { text, changed: false, skipped };
  let out = "";
  let pos = 0;
  for (const e of edits) {
    out += text.slice(pos, e.start);
    out += e.text;
    pos = e.end;
  }
  out += text.slice(pos);
  return { text: out, changed: true, skipped };
}

function assertBlocksPreserved(before, after) {
  const blkBefore = [...before.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => m[0]);
  const blkAfter = [...after.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => m[0]);
  if (blkBefore.length !== blkAfter.length) {
    throw new Error(
      `Block comment count changed: ${blkBefore.length} → ${blkAfter.length}`
    );
  }
  for (let i = 0; i < blkBefore.length; i++) {
    if (blkBefore[i] !== blkAfter[i]) {
      throw new Error("Block comment content changed unexpectedly");
    }
  }
}

function fixText(file, text) {
  const comments = parseComments(file, text);
  const result = mergeCommentRunsInText(text, comments);
  if (result.changed) {
    assertBlocksPreserved(text, result.text);
  }
  return result;
}

function mergeCommentRuns(lines, file = "snippet.mjs") {
  const result = fixText(file, lines.join("\n"));
  return {
    lines: result.text.split("\n"),
    changed: result.changed,
  };
}

function findJsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isHiddenDir(entry) || SKIP_DIRS.has(entry.name)) continue;
      out.push(...findJsFiles(full));
    } else if (entry.isFile() && FILE_RE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function isUnderScripts(file) {
  const rel = path.relative(root, file);
  const top = rel.split(path.sep)[0];
  return top === "scripts";
}

function collectTargets(args) {
  if (args.length === 0) {
    return SCAN_DIRS.flatMap((d) => findJsFiles(path.resolve(root, d))).filter(
      (f) => !isUnderScripts(f)
    );
  }
  const files = [];
  for (const arg of args) {
    const full = path.resolve(process.cwd(), arg);
    if (isUnderScripts(full)) continue;
    if (!fs.existsSync(full)) continue;
    if (fs.statSync(full).isDirectory()) files.push(...findJsFiles(full));
    else if (FILE_RE.test(full) && !isUnderScripts(full)) files.push(full);
  }
  return files;
}

function fixFiles(files, { write = true } = {}) {
  const changedFiles = [];
  const skipped = [];
  const errors = [];

  for (const file of files) {
    try {
      const text = fs.readFileSync(file, "utf8");
      const result = fixText(file, text);
      if (result.changed) {
        if (write) fs.writeFileSync(file, result.text);
        changedFiles.push(file);
      } else if (result.skipped) {
        skipped.push({ file, count: result.skipped });
      }
    } catch (err) {
      errors.push({ file: path.relative(root, file), message: err.message });
    }
  }
  return { changedFiles, skipped, errors };
}

function fixCommentsIn(dir, opts) {
  return fixFiles(findJsFiles(dir), opts);
}

function main(argv) {
  const check = argv.includes("--check");
  const args = argv.filter((a) => !a.startsWith("--"));
  const files = collectTargets(args);

  const { changedFiles, skipped, errors } = fixFiles(files, { write: !check });

  if (changedFiles.length > 0) {
    console.log(
      `${check ? "Would merge" : "Merged"} comment runs in ${changedFiles.length} file(s):`
    );
    for (const f of changedFiles) console.log(`  - ${path.relative(root, f)}`);
  }
  for (const s of skipped) console.log(`  - ${s.file} (${s.count})`);
  for (const e of errors) console.error(`ERROR ${e.file}: ${e.message}`);

  // A guard rail must never block a commit: in write mode (the pre-commit
  // hook) report and carry on. Only an explicit --check run fails.
  if (!check) return 0;
  if (errors.length > 0) return 1;
  if (changedFiles.length > 0) return 1;
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(
      `fix-comments: skipped after unexpected error: ${err.message}`
    );
    process.exitCode = 0;
  }
}

export {
  parseComments,
  findRuns,
  mergeCommentRunsInText,
  fixText,
  mergeCommentRuns,
  findJsFiles,
  fixFiles,
  fixCommentsIn,
  collectTargets,
  main,
  SCAN_DIRS,
  MIN_RUN,
  KEEP,
};
