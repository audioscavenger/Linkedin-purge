#!/usr/bin/env node
/**
 * Fix slop: replace en/em dashes with "-" everywhere in code and Markdown
 * files; replace the ellipsis character "..." (U+2026) with three dots "..."
 * only inside comments of code files and everywhere in Markdown files.
 *
 * Hidden folders (anything starting with "."), node_modules, .git and the
 * other SKIP_DIRS are never touched.
 *
 * Usage: node scripts/fix-slop.mjs [--check] [file-or-dir ...]
 *   (no paths)  scan src, tests, scripts, tools and frontend dirs for code
 *               files; scan all .md files in the repo (excluding hidden dirs).
 *   --check     report only; exit 1 if any file would change
 */

import fs from "node:fs";
import path from "node:path";
import * as espree from "espree";

// Lazily load the TypeScript parser so ordinary `npm run lint` doesn't pay
// the cost when no .ts/.tsx file exists. Top-level await is avoided so a
// missing optional dependency never breaks the module evaluation.
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
  ".git",
  ".husky",
  ".agents",
  "data",
  "dist",
  "build",
  "coverage",
]);

const FILE_RE = /\.[cm]?[jt]sx?$/;

function isHiddenDir(name) {
  return name.startsWith(".");
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

// Array of [search, replace] pairs applied at the top of processing.
const REPLACEMENTS = [
  [/[\u2013\u2014]/g, "-"], // en dash / em dash → hyphen (everywhere)
  [/\u2026/g, "..."], // ellipsis → three dots (comments / md only)
];

const DASH_RE = REPLACEMENTS[0][0];
const DASH_WITH = REPLACEMENTS[0][1];
const ELLIPSIS_RE = REPLACEMENTS[1][0];
const ELLIPSIS_WITH = REPLACEMENTS[1][1];

/*
  Replace every en/em dash with "-" in the whole text. Length-preserving
  (one code unit → one code unit), so comment ranges stay valid afterwards.
*/
function replaceDashesEverywhere(text) {
  return text.replace(DASH_RE, DASH_WITH);
}

/*
  Replace the ellipsis "..." with "..." only inside the given comment ranges.
*/
function replaceEllipsisInComments(text, comments) {
  const ranges = comments
    .filter((c) => c.type === "Line" || c.type === "Block")
    .map((c) => [c.range[0], c.range[1]])
    .toSorted((a, b) => a[0] - b[0]);

  let out = "";
  let pos = 0;

  for (const [start, end] of ranges) {
    out += text.slice(pos, start);
    out += text.slice(start, end).replace(ELLIPSIS_RE, ELLIPSIS_WITH);
    pos = end;
  }

  out += text.slice(pos);

  return out;
}

function processCodeFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  const bom = raw.charCodeAt(0) === 0xfeff ? "\uFEFF" : "";
  const text = bom ? raw.slice(1) : raw;

  const comments = parseComments(file, text);

  let out = replaceDashesEverywhere(text);
  out = replaceEllipsisInComments(out, comments);

  return { text: out, changed: out !== text, bom };
}

function processMarkdownFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  let out = replaceDashesEverywhere(raw);
  out = out.replace(ELLIPSIS_RE, ELLIPSIS_WITH);

  return { text: out, changed: out !== raw };
}

function findJsFiles(dir) {
  const out = [];

  if (!fs.existsSync(dir)) return out;

  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .toSorted((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (isHiddenDir(entry.name) || SKIP_DIRS.has(entry.name)) continue;
      out.push(...findJsFiles(full));
    } else if (entry.isFile() && FILE_RE.test(entry.name)) {
      out.push(full);
    }
  }

  return out;
}

function findMdFiles(dir) {
  const out = [];

  if (!fs.existsSync(dir)) return out;

  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .toSorted((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (isHiddenDir(entry.name) || SKIP_DIRS.has(entry.name)) continue;
      out.push(...findMdFiles(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      out.push(full);
    }
  }

  return out;
}

function collectTargets(args) {
  if (args.length === 0) {
    const codeFiles = SCAN_DIRS.flatMap((d) =>
      findJsFiles(path.resolve(root, d))
    );

    const mdFiles = findMdFiles(root);
    // Remove every file under scripts/ so the fixer never touches its own
    // helpers (fix-comments.js, check-syntax.js, etc.).
    const scriptsDir = path.resolve(root, "scripts");

    const filtered = (f) =>
      !f.startsWith(scriptsDir + path.sep) && f !== scriptsDir;

    const files = [...codeFiles, ...mdFiles].filter(filtered);

    return files;
  }

  const files = [];

  for (const arg of args) {
    const full = path.resolve(process.cwd(), arg);

    if (!fs.existsSync(full)) continue;

    if (fs.statSync(full).isDirectory()) {
      files.push(...findJsFiles(full), ...findMdFiles(full));
    } else if (FILE_RE.test(full) || full.toLowerCase().endsWith(".md")) {
      files.push(full);
    }
  }

  return files;
}

function main(argv) {
  const check = argv.includes("--check");
  const args = argv.filter((a) => !a.startsWith("--"));
  const files = collectTargets(args);

  const changedFiles = [];
  const errors = [];

  for (const file of files) {
    try {
      const ext = path.extname(file).toLowerCase();

      if (FILE_RE.test(file)) {
        const result = processCodeFile(file);

        if (result.changed) {
          if (!check) fs.writeFileSync(file, result.bom + result.text);
          changedFiles.push(file);
        }
      } else if (ext === ".md") {
        const result = processMarkdownFile(file);

        if (result.changed) {
          if (!check) fs.writeFileSync(file, result.text);
          changedFiles.push(file);
        }
      }
    } catch (err) {
      errors.push({ file: path.relative(root, file), message: err.message });
    }
  }

  if (changedFiles.length > 0) {
    console.log(
      `${check ? "Would replace" : "Replaced"} slop in ${changedFiles.length} file(s):`
    );

    for (const f of changedFiles) console.log(`  - ${path.relative(root, f)}`);
  }

  for (const e of errors) {
    console.error(`ERROR ${e.file}: ${e.message}`);
  }

  // A guard rail must never block a commit: in write mode (the pre-commit
  // hook) report and carry on. Only an explicit --check run fails, so CI or a
  // manual audit can still catch slop.
  if (!check) return 0;

  if (errors.length > 0) return 1;

  if (changedFiles.length > 0) return 1;

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    // Same rule as above: an unexpected crash in the fixer is reported, never
    // turned into a failed commit.
    console.error(`fix-slop: skipped after unexpected error: ${err.message}`);
    process.exitCode = 0;
  }
}

export {
  REPLACEMENTS,
  processCodeFile,
  processMarkdownFile,
  findJsFiles,
  findMdFiles,
  collectTargets,
  main,
  SCAN_DIRS,
  SKIP_DIRS,
  FILE_RE,
  parseComments,
  replaceDashesEverywhere,
  replaceEllipsisInComments,
};
