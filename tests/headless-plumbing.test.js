// Tests for --headed / headless plumbing: config default, flag resolution,
// CLI precedence, and the legacy behavior.headless deprecation path.
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { resolveFlag, asBool, resolveHeadless } from "../src/cli/config.js";

// --- Built-in default --------------------------------------------------------
// The built-in default is headless (headed=false), so resolveHeadless returns true.
assert.strictEqual(
  resolveHeadless([]),
  true,
  "default (no flag, no config) resolves headless=true"
);

// --- CLI source: --headed overrides the headless default ---------------------
assert.strictEqual(
  resolveHeadless(["--headed"]),
  false,
  "CLI --headed resolves headless=false (headed)"
);

// --- CLI beats config --------------------------------------------------------
const configPath = path.resolve(process.cwd(), "config.json");
let backup = null;
let existed = fs.existsSync(configPath);
if (existed) backup = fs.readFileSync(configPath, "utf8");
try {
  // Write behavior.headed: true into config.json and assert the CLI --headed
  // still wins when it is present (CLI > config).
  let base = {};
  if (existed) {
    try { base = JSON.parse(backup); } catch (e) { base = {}; }
  }
  if (!base.behavior) base.behavior = {};
  base.behavior.headed = true;
  fs.writeFileSync(configPath, JSON.stringify(base, null, 2) + "\n");
  assert.strictEqual(
    resolveHeadless([]),
    false,
    "config behavior.headed: true resolves headless=false (headed)"
  );
  assert.strictEqual(
    resolveHeadless(["--headed"]),
    false,
    "CLI --headed beats config behavior.headed: true (still headed)"
  );
} finally {
  if (existed) fs.writeFileSync(configPath, backup);
  else if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
}

// --- CLI beats a config behavior.headed: false --------------------------------
let backup2 = null;
let existed2 = fs.existsSync(configPath);
if (existed2) backup2 = fs.readFileSync(configPath, "utf8");
try {
  let base = {};
  if (existed2) {
    try { base = JSON.parse(backup2); } catch (e) { base = {}; }
  }
  if (!base.behavior) base.behavior = {};
  base.behavior.headed = false;
  fs.writeFileSync(configPath, JSON.stringify(base, null, 2) + "\n");
  assert.strictEqual(
    resolveHeadless([]),
    true,
    "config behavior.headed: false resolves headless=true (headless default)"
  );
  assert.strictEqual(
    resolveHeadless(["--headed"]),
    false,
    "CLI --headed beats config behavior.headed: false (CLI > config)"
  );
} finally {
  if (existed2) fs.writeFileSync(configPath, backup2);
  else if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
}

// --- Legacy behavior.headless key: ignored, one deprecation line --------------
let backup3 = null;
let existed3 = fs.existsSync(configPath);
if (existed3) backup3 = fs.readFileSync(configPath, "utf8");
try {
  let base = {};
  if (existed3) {
    try { base = JSON.parse(backup3); } catch (e) { base = {}; }
  }
  if (!base.behavior) base.behavior = {};
  // The legacy key is ignored: the value is not used.
  base.behavior.headless = true;
  fs.writeFileSync(configPath, JSON.stringify(base, null, 2) + "\n");
  const originalError = console.error;
  let deprecationLines = [];
  console.error = (...args) => { deprecationLines.push(args.join(" ")); };
  try {
    const result = resolveHeadless([]);
  } finally {
    console.error = originalError;
  }
  assert.strictEqual(
    deprecationLines.length,
    1,
    "exactly one deprecation line is emitted for behavior.headless"
  );
  assert.ok(
    deprecationLines[0].includes("behavior.headed"),
    "the deprecation line names behavior.headed"
  );
  // The legacy key is ignored: resolveHeadless still returns the built-in
  // default (headless=true) because behavior.headed is absent.
  assert.strictEqual(
    resolveHeadless([]),
    true,
    "legacy behavior.headless is ignored; headless default stands"
  );
} finally {
  if (existed3) fs.writeFileSync(configPath, backup3);
  else if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
}

// --- The config file is never rewritten by loadConfig() ----------------------
let backup4 = null;
let existed4 = fs.existsSync(configPath);
if (existed4) backup4 = fs.readFileSync(configPath, "utf8");
try {
/*
  Write a config that carries the legacy key. resolveHeadless reads it
  (loadConfig creates nothing here because the file exists) and must not
  touch the file on disk.
*/
  let base = {};
  if (existed4) {
    try { base = JSON.parse(backup4); } catch (e) { base = {}; }
  }
  if (!base.behavior) base.behavior = {};
  base.behavior.headless = true;
  fs.writeFileSync(configPath, JSON.stringify(base, null, 2) + "\n");
  const before = fs.readFileSync(configPath, "utf8");
  resolveHeadless([]);
  const after = fs.readFileSync(configPath, "utf8");
  assert.strictEqual(after, before, "config.json is not rewritten when the legacy key is present");
} finally {
  if (existed4) fs.writeFileSync(configPath, backup4);
  else if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
}

// --- resolveFlag still works through the shared seam -------------------------
assert.strictEqual(
  asBool(resolveFlag([], "links", "behavior.links", true), true),
  true,
  "shared resolveFlag seam still resolves behavior.links to true (default on)"
);

console.log("PASS: headless plumbing (default, config, CLI precedence, legacy deprecation)");