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
    scrollWait: 800,
    maxEmptyScrolls: 8,
    maxRetries: 4,
    backoffBase: 10000,
    batchSize: 10,
    timeout: 3600000,
  },
  behavior: {
    headless: false,
    limit: 0,
    resetCheckpoint: false,
  },
};

let _cached = null;

// Load config.json (creating it with defaults if missing) and merge with built-ins.
export function loadConfig() {
  if (_cached) return _cached;
  const configPath = path.resolve(process.cwd(), "config.json");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
    _cached = DEFAULT_CONFIG;
    return _cached;
  }
  let fileConfig;
  try {
    fileConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    console.error("config.json is invalid; using built-in defaults:", error.message);
    _cached = DEFAULT_CONFIG;
    return _cached;
  }
  _cached = deepMerge(DEFAULT_CONFIG, fileConfig);
  return _cached;
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
