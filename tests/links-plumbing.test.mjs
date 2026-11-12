// Tests for --links plumbing: config default, flag resolution, help text and
// the activity page seam option.
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { resolveFlag, asBool, loadConfig } from "../src/cli/config.mjs";
import { createActivityPage } from "../src/activity-loader.mjs";

// --- Config default ---------------------------------------------------------
const cfg = loadConfig();

assert.strictEqual(cfg.behavior.links, true, "behavior.links defaults to true");

// --- Flag resolution: CLI source -------------------------------------------
assert.strictEqual(
  asBool(resolveFlag(["--links"], "links", "behavior.links", false), false),
  true,
  "CLI --links resolves to true"
);

assert.strictEqual(
  asBool(resolveFlag([], "links", "behavior.links", true), true),
  true,
  "absent CLI flag with default config resolves to true"
);

// --- Flag resolution: config source -----------------------------------------
const configPath = path.resolve(process.cwd(), "config.json");
let backup = null;
let existed = fs.existsSync(configPath);

if (existed) backup = fs.readFileSync(configPath, "utf8");

try {
  let base = {};

  if (existed) {
    try {
      base = JSON.parse(backup);
    } catch (e) {
      base = {};
    }
  }

  if (!base.behavior) base.behavior = {};
  base.behavior.links = true;
  fs.writeFileSync(configPath, JSON.stringify(base, null, 2) + "\n");

  const resolved = asBool(
    resolveFlag([], "links", "behavior.links", false),
    false
  );

  assert.strictEqual(
    resolved,
    true,
    "config behavior.links: true resolves to true"
  );
} finally {
  if (existed) fs.writeFileSync(configPath, backup);
  else if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
}

// --- Flag resolution: built-in default source -------------------------------
if (existed) {
  const backup2 = fs.readFileSync(configPath, "utf8");

  try {
    const base = JSON.parse(backup2);

    if (base.behavior) delete base.behavior.links;
    fs.writeFileSync(configPath, JSON.stringify(base, null, 2) + "\n");

    const resolved = asBool(
      resolveFlag([], "links", "behavior.links", false),
      false
    );

    assert.strictEqual(resolved, true, "missing config key falls back to true");
  } finally {
    fs.writeFileSync(configPath, backup2);
  }
}

// --- Page seam: links option reaches collectItems ---------------------------
function makePage() {
  const calls = [];

  return {
    calls,
    evaluate: (fn, ...args) => {
      calls.push({ src: fn.toString(), args });

      return [];
    },
  };
}

const offPage = makePage();
const offSeam = createActivityPage(offPage);

assert.strictEqual(offSeam.links, false, "page seam defaults links to false");

await offSeam.readItems([]);

assert.ok(
  offPage.calls.some(
    (c) =>
      c.src.includes("collectItems(keys)") &&
      !c.src.includes("collectItems(keys, true)")
  ),
  "without links, collectItems is called without the link flag"
);

const onPage = makePage();
const onSeam = createActivityPage(onPage, { links: true });

assert.strictEqual(onSeam.links, true, "page seam stores links: true");

await onSeam.readItems([]);

assert.ok(
  onPage.calls.some((c) => c.src.includes("collectItems(keys, true)")),
  "with links, collectItems is called with true"
);

const boolPage = makePage();
const boolSeam = createActivityPage(boolPage, true);

assert.strictEqual(
  boolSeam.links,
  true,
  "page seam accepts a boolean shorthand"
);

console.log("PASS: links plumbing (config, flag resolution, page seam)");
