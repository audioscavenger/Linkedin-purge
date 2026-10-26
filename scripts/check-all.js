// Runs `node --check` on every .js file under src/ and tests/.
// Exits non-zero if any file has a syntax error.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".js") && !entry.endsWith(".backup")) out.push(full);
  }
  return out;
}

const targets = ["src", "tests"]
  .map((d) => path.join(root, d))
  .filter((d) => fs.existsSync(d))
  .flatMap(walk);

let ok = true;
for (const file of targets) {
  const rel = path.relative(root, file);
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
    console.log(`  ok: ${rel}`);
  } catch {
    console.error(`FAIL: ${rel}`);
    ok = false;
  }
}

if (ok) {
  console.log(`\n${targets.length} files checked.`);
}
process.exit(ok ? 0 : 1);
