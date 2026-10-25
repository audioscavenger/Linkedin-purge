import fs from "node:fs";
import path from "node:path";

export const DEFAULT_CONFIG = {
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
  },
  paths: {
    profileDir: null,
    chromiumPath: null,
  },
};

const CONFIG_FILE = "config.json";

function deepMerge(base, override) {
  const out = { ...base };
  for (const key of Object.keys(override || {})) {
    if (override[key] && typeof override[key] === "object" && !Array.isArray(override[key]) && base[key] && typeof base[key] === "object") {
      out[key] = deepMerge(base[key], override[key]);
    } else {
      out[key] = override[key];
    }
  }
  return out;
}

export function loadConfig(configPath = CONFIG_FILE) {
  const p = path.resolve(configPath);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return deepMerge(DEFAULT_CONFIG, raw);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config, configPath = CONFIG_FILE) {
  fs.writeFileSync(path.resolve(configPath), JSON.stringify(config, null, 2));
}

export const URLS = {
  login: "https://www.linkedin.com/login",
};

export const PATHS = {
  profileDir: ".profile",
  dataDir: "data",
};

export const TIMING = DEFAULT_CONFIG.timing;