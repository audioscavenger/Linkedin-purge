// Configuration loader for CLI parameters.
// Resolution order: CLI flag > config.json > built-in default.
import fs from "node:fs";
import path from "node:path";

// Built-in defaults, used when neither the CLI nor config.json provides a value.
const DEFAULT_CONFIG = {
  paths: {
    profileDir: ".profile-chromium",
    dataDir: "data",
    chromiumPath: null,
  },
  timing: {
    actionMin: 2000,
    actionMax: 5000,
    batchMin: 30000,
    batchMax: 60000,
    // How long one load step waits for the Activity List to grow. A deep scan
    // that sees eight fruitless steps in a row (about 24 s) declares the end.
    growthWait: 3000,
    maxEmptyScrolls: 8,
    maxRetries: 4,
    backoffBase: 10000,
    batchSize: 10,
    timeout: 3600000,
  },
  behavior: {
    headed: false,
    limit: 0,
    resetCheckpoint: false,
    deepScan: false,
    links: false,
  },
};

// Load config.json (creating it with defaults if missing) and merge with built-ins.
export function loadConfig() {
  const configPath = path.resolve(process.cwd(), "config.json");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
    return DEFAULT_CONFIG;
  }
  let fileConfig;
  try {
    fileConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    console.error("config.json is invalid; using built-in defaults:", error.message);
    return DEFAULT_CONFIG;
  }
  return deepMerge(DEFAULT_CONFIG, fileConfig);
}

// Resolve a flag: CLI value if present, else config.json value, else fallback.
// `configPath` is dotted, e.g. "paths.profileDir" or "behavior.headless".
export function resolveFlag(args, cliName, configPath, fallback) {
  const idx = args.indexOf(`--${cliName}`);
  if (idx !== -1) {
    const v = args[idx + 1];
    if (v === undefined || v.startsWith("--")) return true; // bool flag with no value
    return v;
  }
  const config = loadConfig();
  let value = config;
  for (const part of configPath.split(".")) {
    if (value == null) return fallback;
    value = value[part];
  }
  return value === undefined ? fallback : value;
}

// Coerce a flag value into a boolean.
export function asBool(v, fallback = false) {
  if (v === true) return true;
  if (v === false) return false;
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === 1) return true;
  if (v === 0) return false;
  return fallback;
}

// Coerce a flag value into an integer.
export function asInt(v, fallback = 0) {
  const n = typeof v === "string" ? parseInt(v, 10) : v;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Resolve the headless value for a command.
 * Precedence: CLI --headed > config behavior.headed > built-in default (headless).
 * A legacy behavior.headless key in config.json triggers a one-line deprecation
 * warning naming the replacement key; the config file is never rewritten.
 */
export function resolveHeadless(args) {
  const config = loadConfig();
  if (config.behavior && config.behavior.headless !== undefined) {
    console.error("config.json: 'behavior.headless' is deprecated and ignored; use 'behavior.headed' instead.");
  }
  const headed = asBool(resolveFlag(args, "headed", "behavior.headed", false), false);
  return !headed; // true = headless, false = headed
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepMerge(target, source) {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (isPlainObject(source[key]) && isPlainObject(target[key])) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}
