/*
  Fix comment runs: merge three or more consecutive `//` comment lines into
  one block comment. The house rule (AGENTS.md) says the third consecutive
  `//` line means switching to a block comment, so this script re-writes such
  runs. Wired into pre-commit via `npm run fix:comments`.
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["src", "tests", "scripts"];

export function mergeCommentRuns(lines) {
  const out = [];
  let changed = false;
  let i = 0;
  while (i < lines.length) {
    const isComment = /^\s*\/\//.test(lines[i]);
    if (!isComment) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    let j = i;
    while (j < lines.length && /^\s*\/\//.test(lines[j])) j += 1;
    const run = lines.slice(i, j);
    if (run.length >= 3) {
      changed = true;
      const body = run.map((l) => l.replace(/^\s*\/\/\s?/, "")).map((l) => l.trim());
      const block = ["/*"];
      for (const b of body) block.push(b ? `  ${b}` : "");
      block.push("*/");
      out.push(...block);
      i = j;
      continue;
    }
    out.push(...run);
    i = j;
  }
  return { lines: out, changed };
}

export function findJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...findJsFiles(full));
    else if (/\.(js|mjs|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

export function fixCommentsIn(dir) {
  const changedFiles = [];
  const runs = [];
  for (const file of findJsFiles(dir)) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split("\n");
    const { lines: merged, changed } = mergeCommentRuns(lines);
    if (changed) {
      fs.writeFileSync(file, merged.join("\n"));
      changedFiles.push(path.relative(root, file));
    }
    let i = 0;
    while (i < lines.length) {
      if (/^\s*\/\//.test(lines[i])) {
        let j = i;
        while (j < lines.length && /^\s*\/\//.test(lines[j])) j += 1;
        if (j - i >= 3) runs.push({ file: path.relative(root, file), lines: lines.slice(i, j).map((l) => l.trim()) });
        i = j;
      } else {
        i += 1;
      }
    }
  }
  return { changedFiles, runs };
}

function main() {
  const changed = [];
  const runs = [];
  for (const d of SCAN_DIRS) {
    const result = fixCommentsIn(path.join(root, d));
    changed.push(...result.changedFiles);
    runs.push(...result.runs.map((r) => ({ ...r, dir: d })));
  }
  if (changed.length > 0) {
    console.log(`Merged comment runs in ${changed.length} file(s):`);
    for (const f of changed) console.log(`  - ${f}`);
  }
  console.log(`Comment runs of 3+ lines remaining: ${runs.length}`);
  return { changed, runs };
}

if (process.argv[1] && process.argv[1].endsWith("fix-comments.js")) {
  const result = main();
  process.exit(0);
}
