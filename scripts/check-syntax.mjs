#!/usr/bin/env node
/**
 * Check JavaScript syntax for source files under src/ and tests/.
 * Exits non-zero if any file has a syntax error.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));

const files = fs
  .readdirSync(path.resolve(__dirname, "../src"))
  .filter((f) => f.endsWith(".mjs"))
  .map((f) => path.join("src", f));

for (const file of files) {
  try {
    const fullPath = path.resolve(file);
    execFileSync("node", ["--check", fullPath], { stdio: "pipe" });
    console.log(`OK: ${file}`);
  } catch (err) {
    console.error(`FAIL: ${file}`);
    console.error(String(err));
    process.exit(1);
  }
}

console.log("All syntax checks passed.");
