/*
 * Check comment runs: fail when three or more consecutive `//` comment lines
 * carry meaning, per the AGENTS.md house rule (two is the limit; the third
 * consecutive line means switching to a block comment). Runs via `npm run check`
 * and the husky pre-commit hook so violations abort the commit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["src", "tests", "scripts"];

/**
 * Collect every run of three or more consecutive `//` comment lines.
 * @param {string[]} lines - File contents split into lines.
 * @returns {string[][]} Each run is the array of comment lines it covers.
 */
export function findCommentRuns(lines) {
  const runs = [];
  let i = 0;
  while (i < lines.length) {
    if (/^\s*\/\//.test(lines[i])) {
      let j = i;
      while (j < lines.length && /^\s*\/\//.test(lines[j])) j += 1;
      if (j - i >= 3) runs.push(lines.slice(i, j));
      i = j;
    } else {
      i += 1;
    }
  }
  return runs;
}

/**
 * Recursively collect JS-family files under a directory.
 * @param {string} dir - Directory to scan.
 * @returns {string[]} Absolute file paths.
 */
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

/**
 * Scan a directory for comment runs of three or more `//` lines.
 * @param {string} dir - Directory to scan.
 * @returns {{ violations: Array<{ file: string, runs: string[][] }> }} Findings.
 */
export function checkCommentsIn(dir) {
  const violations = [];
  for (const file of findJsFiles(dir)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    const runs = findCommentRuns(lines);
    if (runs.length > 0) {
      violations.push({ file: path.relative(root, file), runs });
    }
  }
  return { violations };
}

function main() {
  const violations = [];
  for (const d of SCAN_DIRS) {
    const { violations: found } = checkCommentsIn(path.join(root, d));
    violations.push(...found);
  }
  if (violations.length > 0) {
    console.error("Comment runs of 3+ consecutive // lines found:");
    for (const v of violations) {
      for (const run of v.runs) {
        console.error(`  ${v.file}:`);
        for (const l of run) console.error(`    ${l}`);
      }
    }
    process.exit(1);
  }
  console.log("No comment runs of 3+ consecutive // lines found.");
}

if (process.argv[1] && process.argv[1].endsWith("check-comments.js")) {
  main();
}
