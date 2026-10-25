export function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

export function warn(msg) {
  console.warn(`[${new Date().toISOString()}] WARN: ${msg}`);
}

export function err(msg) {
  console.error(`[${new Date().toISOString()}] ERROR: ${msg}`);
}